use soroban_sdk::{Env};
use crate::storage::DataKey;
use crate::errors::ContractError;

const DELAY: u64 = 60 * 60 * 48; // 48 hours

pub fn queue_fee_update(e: &Env, new_fee: u32) {
    let now = e.ledger().timestamp();

    e.storage().instance().set(&DataKey::QueuedFee, &new_fee);
    e.storage().instance().set(&DataKey::FeeTimestamp, &now);
}

pub fn execute_fee_update(e: &Env) {
    let now = e.ledger().timestamp();

    let ts: u64 = e.storage().instance().get(&DataKey::FeeTimestamp).unwrap();
    let queued_fee: u32 = e.storage().instance().get(&DataKey::QueuedFee).unwrap();

    if now <= ts + DELAY {
        panic_with_error!(e, ContractError::NotReady);
    }

    e.storage().instance().set(&DataKey::Fee, &queued_fee);
}