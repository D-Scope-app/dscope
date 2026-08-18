use aztec::{macros::notes::note, protocol::traits::Packable};

#[derive(Eq, Packable)]
#[note]
pub struct ParticipationReceiptNote {
    pub survey_key: Field,
    pub policy_hash: Field,
    pub participated_at: u64,
}