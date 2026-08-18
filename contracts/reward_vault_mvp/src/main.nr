use aztec::macros::aztec;

#[aztec]
pub contract RewardVaultMVP {
    use aztec::{
        macros::{
            functions::{external, initializer},
            storage::storage,
        },
        protocol::address::AztecAddress,
        state_vars::{Map, PublicMutable},
    };

    global REWARD_STATUS_NONE: u64 = 0;
    global REWARD_STATUS_REGISTERED: u64 = 1;
    global REWARD_STATUS_FINALIZED: u64 = 2;
    global REWARD_STATUS_CLAIMS_CLOSED: u64 = 3;

    global REWARD_DISABLED: u64 = 0;
    global REWARD_ENABLED: u64 = 1;

    #[storage]
    struct Storage<Context> {
        operator: PublicMutable<AztecAddress, Context>,

        reward_enabled_by_key: Map<Field, PublicMutable<u64, Context>, Context>,
        reward_pool_amount_by_key: Map<Field, PublicMutable<u64, Context>, Context>,
        claim_deadline_by_key: Map<Field, PublicMutable<u64, Context>, Context>,

        final_participant_count_by_key: Map<Field, PublicMutable<u64, Context>, Context>,
        reward_per_participant_by_key: Map<Field, PublicMutable<u64, Context>, Context>,
        total_allocated_by_key: Map<Field, PublicMutable<u64, Context>, Context>,
        dust_return_to_sponsor_by_key: Map<Field, PublicMutable<u64, Context>, Context>,

        distribution_hash_by_key: Map<Field, PublicMutable<Field, Context>, Context>,
        finalized_at_by_key: Map<Field, PublicMutable<u64, Context>, Context>,

        reward_status_by_key: Map<Field, PublicMutable<u64, Context>, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(operator: AztecAddress) {
        assert(operator != AztecAddress::zero(), "invalid operator");
        self.storage.operator.write(operator);
    }

    #[external("public")]
    fn register_reward_config(
        survey_key: Field,
        reward_enabled: u64,
        reward_pool_amount: u64,
        claim_deadline: u64,
    ) {
        let caller = self.msg_sender();
        let operator = self.storage.operator.read();

        assert(caller == operator, "only operator can register reward config");

        let current_status = self.storage.reward_status_by_key.at(survey_key).read();
        assert(current_status == REWARD_STATUS_NONE, "reward config already registered");

       if reward_enabled == REWARD_DISABLED {
    // Rewards disabled.
} else {
    assert(reward_enabled == REWARD_ENABLED, "invalid reward_enabled value");
    assert(reward_pool_amount > 0, "reward pool must be positive");
    assert(claim_deadline > 0, "claim deadline must be positive");
}

        self.storage.reward_enabled_by_key.at(survey_key).write(reward_enabled);
        self.storage.reward_pool_amount_by_key.at(survey_key).write(reward_pool_amount);
        self.storage.claim_deadline_by_key.at(survey_key).write(claim_deadline);

        self.storage.final_participant_count_by_key.at(survey_key).write(0);
        self.storage.reward_per_participant_by_key.at(survey_key).write(0);
        self.storage.total_allocated_by_key.at(survey_key).write(0);
        self.storage.dust_return_to_sponsor_by_key.at(survey_key).write(0);
        self.storage.distribution_hash_by_key.at(survey_key).write(0);
        self.storage.finalized_at_by_key.at(survey_key).write(0);

        self.storage.reward_status_by_key.at(survey_key).write(REWARD_STATUS_REGISTERED);
    }

    #[external("public")]
    fn finalize_reward_distribution(
        survey_key: Field,
        final_participant_count: u64,
        distribution_hash: Field,
        finalized_at: u64,
    ) {
        let caller = self.msg_sender();
        let operator = self.storage.operator.read();

        assert(caller == operator, "only operator can finalize reward distribution");

        let current_status = self.storage.reward_status_by_key.at(survey_key).read();
        assert(current_status == REWARD_STATUS_REGISTERED, "reward config is not registered");

        assert(distribution_hash != 0, "invalid distribution hash");
        assert(finalized_at > 0, "invalid finalized_at");

        let reward_enabled = self.storage.reward_enabled_by_key.at(survey_key).read();
        let reward_pool_amount = self.storage.reward_pool_amount_by_key.at(survey_key).read();

        let mut reward_per_participant: u64 = 0;
        let mut total_allocated: u64 = 0;
        let mut dust_return_to_sponsor: u64 = reward_pool_amount;

        if reward_enabled == REWARD_ENABLED {
            if final_participant_count > 0 {
                reward_per_participant = reward_pool_amount / final_participant_count;
                total_allocated = reward_per_participant * final_participant_count;
                dust_return_to_sponsor = reward_pool_amount - total_allocated;
            }
        }

        self.storage.final_participant_count_by_key.at(survey_key).write(final_participant_count);
        self.storage.reward_per_participant_by_key.at(survey_key).write(reward_per_participant);
        self.storage.total_allocated_by_key.at(survey_key).write(total_allocated);
        self.storage.dust_return_to_sponsor_by_key.at(survey_key).write(dust_return_to_sponsor);
        self.storage.distribution_hash_by_key.at(survey_key).write(distribution_hash);
        self.storage.finalized_at_by_key.at(survey_key).write(finalized_at);

        self.storage.reward_status_by_key.at(survey_key).write(REWARD_STATUS_FINALIZED);
    }

    #[external("public")]
    fn close_claims(
        survey_key: Field,
        current_time: u64,
    ) {
        let caller = self.msg_sender();
        let operator = self.storage.operator.read();

        assert(caller == operator, "only operator can close claims");

        let current_status = self.storage.reward_status_by_key.at(survey_key).read();
        assert(current_status == REWARD_STATUS_FINALIZED, "reward distribution is not finalized");

        let claim_deadline = self.storage.claim_deadline_by_key.at(survey_key).read();
        assert(current_time >= claim_deadline, "claim deadline not reached");

        self.storage.reward_status_by_key.at(survey_key).write(REWARD_STATUS_CLAIMS_CLOSED);
    }

    #[external("utility")]
    unconstrained fn get_operator() -> pub AztecAddress {
        self.storage.operator.read()
    }

    #[external("utility")]
    unconstrained fn get_reward_enabled(survey_key: Field) -> pub u64 {
        self.storage.reward_enabled_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_reward_pool_amount(survey_key: Field) -> pub u64 {
        self.storage.reward_pool_amount_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_claim_deadline(survey_key: Field) -> pub u64 {
        self.storage.claim_deadline_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_final_participant_count(survey_key: Field) -> pub u64 {
        self.storage.final_participant_count_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_reward_per_participant(survey_key: Field) -> pub u64 {
        self.storage.reward_per_participant_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_total_allocated(survey_key: Field) -> pub u64 {
        self.storage.total_allocated_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_dust_return_to_sponsor(survey_key: Field) -> pub u64 {
        self.storage.dust_return_to_sponsor_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_distribution_hash(survey_key: Field) -> pub Field {
        self.storage.distribution_hash_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_finalized_at(survey_key: Field) -> pub u64 {
        self.storage.finalized_at_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_reward_status(survey_key: Field) -> pub u64 {
        self.storage.reward_status_by_key.at(survey_key).read()
    }
}
