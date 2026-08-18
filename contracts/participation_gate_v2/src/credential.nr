use aztec::{macros::notes::note, protocol::traits::Packable};

#[derive(Eq, Packable)]
#[note]
pub struct CredentialNote {
    pub age_bucket: u64,
    pub country_bucket: u64,
    pub world_region: u64,
    pub valid_until: u64,
    pub source_tag: Field,
    pub credential_version: Field,
}