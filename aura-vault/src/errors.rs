#![allow(unused)]

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum VaultError {
    NotInitialized         = 1,
    AlreadyInitialized     = 2,
    InsufficientShares     = 3,
    InsufficientUnderlying = 4,
    ZeroAmount             = 5,
    MathOverflow           = 6,
    InvalidAddress         = 7,
    ZeroShares             = 8,
    TimelockNotExpired     = 9,
    NotApproved            = 10,
    AlreadyVoted           = 11,
}
