use aztec::{macros::notes::note, protocol::traits::Packable};

#[derive(Eq, Packable)]
#[note]
pub struct ParticipationConsumptionNote {
    pub survey_key: Field,
    pub consumed_at: u64,
}