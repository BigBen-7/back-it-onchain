#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke},
    vec, Address, BytesN, Env, IntoVal, String,
};

fn setup_env() -> (Env, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let stake_token_admin = Address::generate(&env);
    let stake_token_contract = env.register_stellar_asset_contract_v2(stake_token_admin.clone());
    let stake_token = stake_token_contract.address();
    let stake_token_admin_client = token::StellarAssetClient::new(&env, &stake_token);

    let creator = Address::generate(&env);
    stake_token_admin_client.mint(&creator, &10_000);

    (env, contract_id, admin, stake_token, creator)
}

fn default_metadata(env: &Env) -> CreateCallMetadata {
    CreateCallMetadata {
        token_address: Address::generate(env),
        pair_id: BytesN::from_array(env, &[0; 32]),
        ipfs_cid: String::from_str(env, "QmHash"),
    }
}

// ── Existing tests (preserved) ────────────────────────────────────────────────

#[test]
fn test_create_call() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let creator = Address::generate(&env);
    let stake_token_admin = Address::generate(&env);
    let stake_token_contract = env.register_stellar_asset_contract_v2(stake_token_admin.clone());
    let stake_token = stake_token_contract.address();
    let stake_token_client = token::Client::new(&env, &stake_token);
    let stake_token_admin_client = token::StellarAssetClient::new(&env, &stake_token);

    stake_token_admin_client.mint(&creator, &1000);

    let end_ts = env.ledger().timestamp() + 1000;
    let call_id = client.create_call(
        &creator,
        &stake_token,
        &100,
        &end_ts,
        &default_metadata(&env),
    );

    assert_eq!(call_id, 0);
    let call = client.get_call(&call_id);
    assert_eq!(call.creator, creator);
    assert_eq!(call.total_stake_yes, 100);
    assert_eq!(call.total_stake_no, 0);
    assert_eq!(call.participant_count, 1);

    let stake = client.get_user_stake(&call_id, &creator, &true);
    assert_eq!(stake, 100);

    assert_eq!(stake_token_client.balance(&creator), 900);
    assert_eq!(stake_token_client.balance(&contract_id), 100);

    let events = env.events().all();
    let last_event = events.last().unwrap();
    let symbol: Symbol = last_event.1.get(0).unwrap().into_val(&env);
    assert_eq!(symbol, Symbol::new(&env, "CallCreated"));
}

#[test]
fn test_stake_on_call() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let creator = Address::generate(&env);
    let staker = Address::generate(&env);
    let stake_token_admin = Address::generate(&env);
    let stake_token_contract = env.register_stellar_asset_contract_v2(stake_token_admin.clone());
    let stake_token = stake_token_contract.address();
    let stake_token_admin_client = token::StellarAssetClient::new(&env, &stake_token);

    stake_token_admin_client.mint(&creator, &1000);
    stake_token_admin_client.mint(&staker, &1000);

    let end_ts = env.ledger().timestamp() + 1000;
    let call_id = client.create_call(
        &creator,
        &stake_token,
        &100,
        &end_ts,
        &default_metadata(&env),
    );

    client.stake_on_call(&call_id, &staker, &1000, &false);

    let call = client.get_call(&call_id);
    assert_eq!(call.total_stake_yes, 100);
    // 50 bp fee on 1000 = 5; net = 995
    assert_eq!(call.total_stake_no, 995);
    assert_eq!(call.participant_count, 2);
}

#[test]
#[should_panic(expected = "End time must be in future")]
fn test_create_call_past_end_time() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    let creator = Address::generate(&env);
    let stake_token = Address::generate(&env);
    client.create_call(
        &creator,
        &stake_token,
        &100,
        &env.ledger().timestamp(),
        &default_metadata(&env),
    );
}

#[test]
#[should_panic(expected = "Call ended")]
fn test_stake_ended_call() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let creator = Address::generate(&env);
    let staker = Address::generate(&env);
    let stake_token_admin = Address::generate(&env);
    let stake_token_contract = env.register_stellar_asset_contract_v2(stake_token_admin.clone());
    let stake_token = stake_token_contract.address();
    let stake_token_admin_client = token::StellarAssetClient::new(&env, &stake_token);
    stake_token_admin_client.mint(&creator, &1000);
    stake_token_admin_client.mint(&staker, &1000);

    let end_ts = env.ledger().timestamp() + 100;
    let call_id = client.create_call(
        &creator,
        &stake_token,
        &100,
        &end_ts,
        &default_metadata(&env),
    );
    env.ledger().set_timestamp(end_ts + 1);
    client.stake_on_call(&call_id, &staker, &50, &false);
}

#[test]
#[should_panic(expected = "Contract is paused")]
fn test_create_call_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    client.pause();

    let creator = Address::generate(&env);
    let stake_token = Address::generate(&env);
    client.create_call(
        &creator,
        &stake_token,
        &100,
        &(env.ledger().timestamp() + 1000),
        &default_metadata(&env),
    );
}

#[test]
fn test_pause_unpause_flow() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    assert!(!client.get_is_paused());

    let creator = Address::generate(&env);
    let staker = Address::generate(&env);
    let stake_token_admin = Address::generate(&env);
    let stake_token_contract = env.register_stellar_asset_contract_v2(stake_token_admin.clone());
    let stake_token = stake_token_contract.address();
    let stake_token_admin_client = token::StellarAssetClient::new(&env, &stake_token);
    stake_token_admin_client.mint(&creator, &1000);
    stake_token_admin_client.mint(&staker, &1000);

    let end_ts = env.ledger().timestamp() + 1000;
    let call_id = client.create_call(
        &creator,
        &stake_token,
        &100,
        &end_ts,
        &default_metadata(&env),
    );

    client.pause();
    assert!(client.get_is_paused());
    client.unpause();
    assert!(!client.get_is_paused());

    client.stake_on_call(&call_id, &staker, &50, &false);
}

#[test]
#[should_panic]
fn test_pause_requires_admin_auth() {
    let env = Env::default();
    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (&admin,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&admin);

    let attacker = Address::generate(&env);
    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "pause",
            args: ().into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.pause();
}

#[test]
#[should_panic]
fn test_unpause_requires_admin_auth() {
    let env = Env::default();
    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (&admin,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&admin);

    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "pause",
            args: ().into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.pause();

    let attacker = Address::generate(&env);
    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "unpause",
            args: ().into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.unpause();
}

// ── Issue #161: Dynamic surge fee ────────────────────────────────────────────

#[test]
fn test_surge_fee_basis_points() {
    // 0 participants → 50 bp
    assert_eq!(compute_fee_basis_points(0), 50);
    // 10 participants → 55 bp
    assert_eq!(compute_fee_basis_points(10), 55);
    // 100 participants → 100 bp
    assert_eq!(compute_fee_basis_points(100), 100);
    // 300 participants → capped at 200 bp
    assert_eq!(compute_fee_basis_points(300), 200);
    // 1000 participants → still capped at 200 bp
    assert_eq!(compute_fee_basis_points(1000), 200);
}

#[test]
fn test_stake_applies_surge_fee() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let creator = Address::generate(&env);
    let staker = Address::generate(&env);
    let stake_token_admin = Address::generate(&env);
    let stake_token_contract = env.register_stellar_asset_contract_v2(stake_token_admin.clone());
    let stake_token = stake_token_contract.address();
    let stake_token_admin_client = token::StellarAssetClient::new(&env, &stake_token);
    stake_token_admin_client.mint(&creator, &10_000);
    stake_token_admin_client.mint(&staker, &10_000);

    let end_ts = env.ledger().timestamp() + 1000;
    let call_id = client.create_call(
        &creator,
        &stake_token,
        &100,
        &end_ts,
        &default_metadata(&env),
    );

    // participant_count = 1 → fee_bps = 50; stake 10_000 → fee = 5, net = 9_995
    client.stake_on_call(&call_id, &staker, &10_000, &false);

    let call = client.get_call(&call_id);
    assert_eq!(call.total_stake_no, 9_995);
    assert_eq!(call.participant_count, 2);

    // Platform fees should have accumulated
    let fees = client.get_platform_fees();
    assert_eq!(fees, 5);
}

#[test]
fn test_get_fee_basis_points() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let creator = Address::generate(&env);
    let stake_token_admin = Address::generate(&env);
    let stake_token_contract = env.register_stellar_asset_contract_v2(stake_token_admin.clone());
    let stake_token = stake_token_contract.address();
    let stake_token_admin_client = token::StellarAssetClient::new(&env, &stake_token);
    stake_token_admin_client.mint(&creator, &1000);

    let end_ts = env.ledger().timestamp() + 1000;
    let call_id = client.create_call(
        &creator,
        &stake_token,
        &100,
        &end_ts,
        &default_metadata(&env),
    );

    // 1 participant → 50 bp
    assert_eq!(client.get_fee_basis_points(&call_id), 50);
}

// ── Issue #160: distribute_dividends ─────────────────────────────────────────

#[test]
fn test_distribute_dividends() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let creator = Address::generate(&env);
    let staker = Address::generate(&env);
    let stake_token_admin = Address::generate(&env);
    let stake_token_contract = env.register_stellar_asset_contract_v2(stake_token_admin.clone());
    let stake_token = stake_token_contract.address();
    let stake_token_client = token::Client::new(&env, &stake_token);
    let stake_token_admin_client = token::StellarAssetClient::new(&env, &stake_token);
    stake_token_admin_client.mint(&creator, &10_000);
    stake_token_admin_client.mint(&staker, &10_000);

    let end_ts = env.ledger().timestamp() + 1000;
    let call_id = client.create_call(
        &creator,
        &stake_token,
        &100,
        &end_ts,
        &default_metadata(&env),
    );

    // Stake to generate fees: 10_000 * 50bp / 10_000 = 5 fee
    client.stake_on_call(&call_id, &staker, &10_000, &false);
    assert_eq!(client.get_platform_fees(), 5);

    let holder_a = Address::generate(&env);
    let holder_b = Address::generate(&env);

    // Distribute: holder_a has weight 3, holder_b has weight 2 → total 5
    // holder_a gets 5 * 3/5 = 3, holder_b gets 5 * 2/5 = 2
    let stakers = vec![&env, (holder_a.clone(), 3i128), (holder_b.clone(), 2i128)];
    client.distribute_dividends(&stake_token, &stakers);

    assert_eq!(stake_token_client.balance(&holder_a), 3);
    assert_eq!(stake_token_client.balance(&holder_b), 2);
    assert_eq!(client.get_platform_fees(), 0);
}

#[test]
#[should_panic(expected = "No fees to distribute")]
fn test_distribute_dividends_no_fees() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, CallRegistry);
    let client = CallRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let stake_token_admin = Address::generate(&env);
    let stake_token_contract = env.register_stellar_asset_contract_v2(stake_token_admin.clone());
    let stake_token = stake_token_contract.address();

    let holder = Address::generate(&env);
    let stakers = vec![&env, (holder.clone(), 1i128)];
    client.distribute_dividends(&stake_token, &stakers);
}
