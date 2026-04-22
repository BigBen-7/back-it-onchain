#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, BytesN, Env, String, Symbol, Vec,
};

// ── Vault interface (mock / Phoenix-compatible) ───────────────────────────────
// Any Soroban lending vault that exposes deposit/withdraw is compatible.
mod vault {
    use soroban_sdk::{contractclient, Address, Env};

    #[contractclient(name = "VaultClient")]
    pub trait Vault {
        fn deposit(env: Env, from: Address, amount: i128);
        fn withdraw(env: Env, to: Address, amount: i128);
    }
}

// ── Data types ────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Call {
    pub creator: Address,
    pub stake_token: Address,
    pub total_stake_yes: i128,
    pub total_stake_no: i128,
    pub start_ts: u64,
    pub end_ts: u64,
    pub token_address: Address,
    pub pair_id: BytesN<32>,
    pub ipfs_cid: String,
    pub settled: bool,
    pub outcome: bool,
    pub final_price: i128,
    /// Total funds currently deposited in the vault for this call.
    pub vault_balance: i128,
    /// Number of unique participants (used for surge-fee calculation).
    pub participant_count: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CreateCallMetadata {
    pub token_address: Address,
    pub pair_id: BytesN<32>,
    pub ipfs_cid: String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Call(u64),
    NextCallId,
    UserStake(u64, Address, bool),
    Admin,
    IsPaused,
    /// Optional vault contract address (set by admin).
    VaultContract,
    /// Accumulated platform fees available for dividend distribution.
    PlatformFees,
}

// ── Surge-fee helper ──────────────────────────────────────────────────────────

/// Returns fee in basis points (1 bp = 0.01 %).
/// Base fee: 50 bp (0.5 %).  Each additional 10 participants adds 5 bp, capped at 200 bp (2 %).
///
/// | participants | fee bp |
/// |-------------|--------|
/// | 0–9         | 50     |
/// | 10–19       | 55     |
/// | …           | …      |
/// | ≥300        | 200    |
pub fn compute_fee_basis_points(participant_count: u32) -> i128 {
    const BASE_BPS: i128 = 50;
    const MAX_BPS: i128 = 200;
    const STEP: u32 = 10;
    const BPS_PER_STEP: i128 = 5;

    let steps = (participant_count / STEP) as i128;
    let fee = BASE_BPS + steps * BPS_PER_STEP;
    if fee > MAX_BPS {
        MAX_BPS
    } else {
        fee
    }
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct CallRegistry;

#[contractimpl]
impl CallRegistry {
    fn get_admin(env: &Env) -> Address {
        env.storage()
            .persistent()
            .get(&DataKey::Admin)
            .expect("Admin not set")
    }

    fn is_paused(env: &Env) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::IsPaused)
            .unwrap_or(false)
    }

    fn assert_not_paused(env: &Env) {
        if Self::is_paused(env) {
            panic!("Contract is paused");
        }
    }

    // ── Vault helpers ─────────────────────────────────────────────────────────

    fn vault_contract(env: &Env) -> Option<Address> {
        env.storage().persistent().get(&DataKey::VaultContract)
    }

    /// Deposit `amount` into the vault on behalf of the contract.
    fn vault_deposit(env: &Env, stake_token: &Address, amount: i128) {
        if let Some(vault_addr) = Self::vault_contract(env) {
            let client = vault::VaultClient::new(env, &vault_addr);
            // Approve vault to pull funds from this contract first.
            let token_client = token::Client::new(env, stake_token);
            token_client.approve(
                &env.current_contract_address(),
                &vault_addr,
                &amount,
                &(env.ledger().sequence() + 100),
            );
            client.deposit(&env.current_contract_address(), &amount);
        }
    }

    /// Withdraw `amount` from the vault back to this contract.
    fn vault_withdraw(env: &Env, amount: i128) {
        if let Some(vault_addr) = Self::vault_contract(env) {
            let client = vault::VaultClient::new(env, &vault_addr);
            client.withdraw(&env.current_contract_address(), &amount);
        }
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// Initialize admin and pause state.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().persistent().has(&DataKey::Admin) {
            panic!("Contract already initialized");
        }
        admin.require_auth();
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::IsPaused, &false);
    }

    /// Set (or clear) the vault contract address (admin only).
    pub fn set_vault(env: Env, vault: Address) {
        let admin = Self::get_admin(&env);
        admin.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::VaultContract, &vault);
    }

    pub fn pause(env: Env) {
        let admin = Self::get_admin(&env);
        admin.require_auth();
        env.storage().persistent().set(&DataKey::IsPaused, &true);
    }

    pub fn unpause(env: Env) {
        let admin = Self::get_admin(&env);
        admin.require_auth();
        env.storage().persistent().set(&DataKey::IsPaused, &false);
    }

    pub fn get_is_paused(env: Env) -> bool {
        Self::is_paused(&env)
    }

    // ── Core call lifecycle ───────────────────────────────────────────────────

    /// Create a new prediction call.
    /// Stakes are deposited into the vault (if configured) to earn yield.
    pub fn create_call(
        env: Env,
        creator: Address,
        stake_token: Address,
        stake_amount: i128,
        end_ts: u64,
        metadata: CreateCallMetadata,
    ) -> u64 {
        Self::assert_not_paused(&env);
        creator.require_auth();

        if end_ts <= env.ledger().timestamp() {
            panic!("End time must be in future");
        }
        if stake_amount <= 0 {
            panic!("Stake amount must be > 0");
        }

        // Transfer stake from creator to contract
        let token_client = token::Client::new(&env, &stake_token);
        token_client.transfer(&creator, &env.current_contract_address(), &stake_amount);

        // Deposit into vault (issue #159)
        Self::vault_deposit(&env, &stake_token, stake_amount);

        let call_id = env
            .storage()
            .instance()
            .get(&DataKey::NextCallId)
            .unwrap_or(0u64);
        env.storage()
            .instance()
            .set(&DataKey::NextCallId, &(call_id + 1));

        let start_ts = env.ledger().timestamp();

        let call = Call {
            creator: creator.clone(),
            stake_token: stake_token.clone(),
            total_stake_yes: stake_amount,
            total_stake_no: 0,
            start_ts,
            end_ts,
            token_address: metadata.token_address.clone(),
            pair_id: metadata.pair_id.clone(),
            ipfs_cid: metadata.ipfs_cid.clone(),
            settled: false,
            outcome: false,
            final_price: 0,
            vault_balance: stake_amount,
            participant_count: 1,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Call(call_id), &call);

        env.storage().persistent().set(
            &DataKey::UserStake(call_id, creator.clone(), true),
            &stake_amount,
        );

        env.events().publish(
            (Symbol::new(&env, "CallCreated"), call_id, creator),
            (
                stake_token,
                stake_amount,
                start_ts,
                end_ts,
                metadata.token_address,
                metadata.pair_id,
                metadata.ipfs_cid,
            ),
        );

        call_id
    }

    /// Stake on an existing call.
    /// Applies a dynamic surge fee based on participant count (issue #161).
    /// Net stake (after fee) is deposited into the vault (issue #159).
    pub fn stake_on_call(env: Env, call_id: u64, staker: Address, amount: i128, position: bool) {
        Self::assert_not_paused(&env);
        staker.require_auth();

        let key = DataKey::Call(call_id);
        let mut call: Call = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Call does not exist");

        if env.ledger().timestamp() >= call.end_ts {
            panic!("Call ended");
        }
        if call.settled {
            panic!("Call settled");
        }
        if amount <= 0 {
            panic!("Amount must be > 0");
        }

        // Transfer full amount from staker to contract
        let token_client = token::Client::new(&env, &call.stake_token);
        token_client.transfer(&staker, &env.current_contract_address(), &amount);

        // Dynamic surge fee (issue #161)
        let fee_bps = compute_fee_basis_points(call.participant_count);
        let fee = amount * fee_bps / 10_000;
        let net_amount = amount - fee;

        // Accumulate platform fee for dividend distribution (issue #160)
        if fee > 0 {
            let current_fees: i128 = env
                .storage()
                .persistent()
                .get(&DataKey::PlatformFees)
                .unwrap_or(0);
            env.storage()
                .persistent()
                .set(&DataKey::PlatformFees, &(current_fees + fee));
        }

        // Deposit net stake into vault (issue #159)
        Self::vault_deposit(&env, &call.stake_token, net_amount);

        // Update totals with net amount
        if position {
            call.total_stake_yes += net_amount;
        } else {
            call.total_stake_no += net_amount;
        }
        call.vault_balance += net_amount;
        call.participant_count += 1;
        env.storage().persistent().set(&key, &call);

        let stake_key = DataKey::UserStake(call_id, staker.clone(), position);
        let current_stake: i128 = env.storage().persistent().get(&stake_key).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&stake_key, &(current_stake + net_amount));

        env.events().publish(
            (Symbol::new(&env, "StakeAdded"), call_id, staker),
            (position, net_amount, fee, fee_bps),
        );
    }

    /// Withdraw payout for a settled call.
    /// Withdraws principal from vault before transferring to winner (issue #159).
    pub fn withdraw_payout(env: Env, call_id: u64, user: Address, position: bool) {
        user.require_auth();

        let key = DataKey::Call(call_id);
        let mut call: Call = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Call does not exist");

        if !call.settled {
            panic!("Call not settled");
        }
        if call.outcome != position {
            panic!("Not on winning side");
        }

        let stake_key = DataKey::UserStake(call_id, user.clone(), position);
        let user_stake: i128 = env
            .storage()
            .persistent()
            .get(&stake_key)
            .expect("No stake found");

        if user_stake == 0 {
            panic!("Nothing to withdraw");
        }

        let winners_pool = if position {
            call.total_stake_yes
        } else {
            call.total_stake_no
        };
        let losers_pool = if position {
            call.total_stake_no
        } else {
            call.total_stake_yes
        };

        // Proportional share of losers pool
        let payout = user_stake + (user_stake * losers_pool / winners_pool);

        // Withdraw from vault (issue #159); vault keeps the interest
        Self::vault_withdraw(&env, payout);
        call.vault_balance -= payout;
        env.storage().persistent().set(&key, &call);

        // Clear user stake
        env.storage().persistent().set(&stake_key, &0i128);

        let token_client = token::Client::new(&env, &call.stake_token);
        token_client.transfer(&env.current_contract_address(), &user, &payout);

        env.events().publish(
            (Symbol::new(&env, "PayoutWithdrawn"), call_id, user),
            payout,
        );
    }

    // ── Dividend distribution (issue #160) ────────────────────────────────────

    /// Distribute accumulated platform fees proportionally to governance token holders.
    /// `stakers` is a list of (address, governance_token_balance) pairs.
    /// The treasury (admin) keeps the interest earned by the vault; only explicit
    /// platform fees collected via surge pricing are distributed here.
    pub fn distribute_dividends(env: Env, stake_token: Address, stakers: Vec<(Address, i128)>) {
        let admin = Self::get_admin(&env);
        admin.require_auth();

        let total_fees: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::PlatformFees)
            .unwrap_or(0);

        if total_fees == 0 {
            panic!("No fees to distribute");
        }

        // Compute total governance weight
        let mut total_weight: i128 = 0;
        for i in 0..stakers.len() {
            let (_, weight) = stakers.get(i).unwrap();
            total_weight += weight;
        }
        if total_weight == 0 {
            panic!("Total weight is zero");
        }

        let token_client = token::Client::new(&env, &stake_token);

        for i in 0..stakers.len() {
            let (addr, weight) = stakers.get(i).unwrap();
            let share = total_fees * weight / total_weight;
            if share > 0 {
                token_client.transfer(&env.current_contract_address(), &addr, &share);
            }
        }

        // Reset accumulated fees
        env.storage()
            .persistent()
            .set(&DataKey::PlatformFees, &0i128);

        env.events().publish(
            (Symbol::new(&env, "DividendsDistributed"),),
            (total_fees, total_weight),
        );
    }

    // ── Finalize ──────────────────────────────────────────────────────────────

    /// Finalize a call. Deducts a gas fee from the losers' pool.
    pub fn finalize_call(
        env: Env,
        call_id: u64,
        outcome: bool,
        final_price: i128,
        caller: Address,
    ) {
        caller.require_auth();

        let key = DataKey::Call(call_id);
        let mut call: Call = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Call does not exist");

        if call.settled {
            panic!("Call already settled");
        }
        if env.ledger().timestamp() < call.end_ts {
            panic!("Call has not ended yet");
        }

        let losers_pool = if outcome {
            call.total_stake_no
        } else {
            call.total_stake_yes
        };

        let gas_fee = losers_pool * 5 / 1000;

        if gas_fee > 0 {
            // Withdraw gas fee from vault before paying caller
            Self::vault_withdraw(&env, gas_fee);
            call.vault_balance -= gas_fee;
            let token_client = token::Client::new(&env, &call.stake_token);
            token_client.transfer(&env.current_contract_address(), &caller, &gas_fee);
        }

        call.settled = true;
        call.outcome = outcome;
        call.final_price = final_price;
        env.storage().persistent().set(&key, &call);

        env.events().publish(
            (Symbol::new(&env, "CallFinalized"), call_id, caller),
            (outcome, final_price, gas_fee),
        );
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    pub fn get_call(env: Env, call_id: u64) -> Call {
        env.storage()
            .persistent()
            .get(&DataKey::Call(call_id))
            .expect("Call does not exist")
    }

    pub fn get_user_stake(env: Env, call_id: u64, user: Address, position: bool) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::UserStake(call_id, user, position))
            .unwrap_or(0)
    }

    pub fn get_platform_fees(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::PlatformFees)
            .unwrap_or(0)
    }

    pub fn get_fee_basis_points(env: Env, call_id: u64) -> i128 {
        let call: Call = env
            .storage()
            .persistent()
            .get(&DataKey::Call(call_id))
            .expect("Call does not exist");
        compute_fee_basis_points(call.participant_count)
    }
}

mod test;
