use soroban_sdk::{Address, Env, Symbol};

pub fn mint_soul(e: &Env, user: Address) {
    let key = (Symbol::short("SOUL"), user.clone());
    e.storage().persistent().set(&key, &true);
}

// Prevent transfer by design (no transfer function)
