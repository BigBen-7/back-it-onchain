use soroban_sdk::{Env, Address};
use crate::storage::DataKey;
use crate::errors::ContractError;

pub fn require_owner(e: &Env, addr: &Address) {
    let owner: Address = e.storage().instance().get(&DataKey::Owner).unwrap();
    if &owner != addr {
        panic_with_error!(e, ContractError::Unauthorized);
    }
}

pub fn require_councilor(e: &Env, addr: &Address) {
    let councilor: Address = e.storage().instance().get(&DataKey::Councilor).unwrap();
    if &councilor != addr {
        panic_with_error!(e, ContractError::Unauthorized);
    }
}