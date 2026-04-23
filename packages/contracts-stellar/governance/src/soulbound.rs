use soroban_sdk::{Env, Address, Symbol};

pub fn mint_soul(e: &Env, user: Address) {
    let key = (Symbol::short("SOUL"), user.clone());
    e.storage().persistent().set(&key, &true);
}

// Prevent transfer by design (no transfer function)