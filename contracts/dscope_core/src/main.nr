use aztec::macros::aztec;

#[aztec]
pub contract DScopeCore {
    use participation_gate_v2::ParticipationGateV2;

    use aztec::{
        macros::{
            functions::{external, initializer},
            storage::storage,
        },
        protocol::address::AztecAddress,
        state_vars::PublicMutable,
    };

    #[storage]
    struct Storage<Context> {
        sponsor: PublicMutable<AztecAddress, Context>,
        treasury: PublicMutable<AztecAddress, Context>,
        system_finalizer: PublicMutable<AztecAddress, Context>,
        participation_gate: PublicMutable<AztecAddress, Context>,
        survey_key: PublicMutable<Field, Context>,

        metadata_hash: PublicMutable<Field, Context>,
        predicate_policy_hash: PublicMutable<Field, Context>,

        start_time: PublicMutable<u64, Context>,
        end_time: PublicMutable<u64, Context>,

        result_hash: PublicMutable<Field, Context>,
        distribution_hash: PublicMutable<Field, Context>,
        finalized_at: PublicMutable<u64, Context>,

        reward_pool_amount: PublicMutable<Field, Context>,
        claim_deadline: PublicMutable<Field, Context>,
        reward_enabled: PublicMutable<Field, Context>,

        minimum_sample_target: PublicMutable<Field, Context>,
        final_participant_count: PublicMutable<Field, Context>,

        analytics_min_total_sample: PublicMutable<Field, Context>,
        analytics_min_segment_sample: PublicMutable<Field, Context>,
        analytics_visibility_mode: PublicMutable<Field, Context>,

        cancel_reason_code: PublicMutable<Field, Context>,
        status: PublicMutable<Field, Context>,
    }

    global STATUS_ACTIVE: Field = 1;
    global STATUS_FINALIZED: Field = 2;
    global STATUS_CANCELLED: Field = 3;

    #[external("public")]
    #[initializer]
    fn constructor(
        sponsor: AztecAddress,
        treasury: AztecAddress,
        system_finalizer: AztecAddress,
        participation_gate: AztecAddress,
        survey_key: Field,
        metadata_hash: Field,
        predicate_policy_hash: Field,
        start_time: u64,
        end_time: u64,
        reward_pool_amount: Field,
        claim_deadline: Field,
        reward_enabled: Field,
        minimum_sample_target: Field,
        analytics_min_total_sample: Field,
        analytics_min_segment_sample: Field,
        analytics_visibility_mode: Field,
    ) {
        assert(sponsor != AztecAddress::zero(), "invalid sponsor");
        assert(treasury != AztecAddress::zero(), "invalid treasury");
        assert(system_finalizer != AztecAddress::zero(), "invalid finalizer");
        assert(participation_gate != AztecAddress::zero(), "invalid participation gate");
        assert(survey_key != 0, "invalid survey key");
        assert(metadata_hash != 0, "invalid metadata hash");
        assert(predicate_policy_hash != 0, "invalid policy hash");
        assert(end_time >= start_time, "invalid survey time range");

        self.storage.sponsor.write(sponsor);
        self.storage.treasury.write(treasury);
        self.storage.system_finalizer.write(system_finalizer);
        self.storage.participation_gate.write(participation_gate);
        self.storage.survey_key.write(survey_key);

        self.storage.metadata_hash.write(metadata_hash);
        self.storage.predicate_policy_hash.write(predicate_policy_hash);

        self.storage.start_time.write(start_time);
        self.storage.end_time.write(end_time);

        self.storage.result_hash.write(0);
        self.storage.distribution_hash.write(0);
        self.storage.finalized_at.write(0);
        self.storage.cancel_reason_code.write(0);
        self.storage.final_participant_count.write(0);

        self.storage.reward_pool_amount.write(reward_pool_amount);
        self.storage.claim_deadline.write(claim_deadline);
        self.storage.reward_enabled.write(reward_enabled);
        self.storage.minimum_sample_target.write(minimum_sample_target);

        self.storage.analytics_min_total_sample.write(analytics_min_total_sample);
        self.storage.analytics_min_segment_sample.write(analytics_min_segment_sample);
        self.storage.analytics_visibility_mode.write(analytics_visibility_mode);

        self.storage.status.write(STATUS_ACTIVE);
    }

    #[external("public")]
    fn cancel_before_start(cancel_reason_code: Field, current_time: u64) {
        let caller = self.msg_sender();
        let sponsor = self.storage.sponsor.read();
        assert(caller == sponsor, "only sponsor can cancel");

        let current_status = self.storage.status.read();
        assert(current_status == STATUS_ACTIVE, "survey cannot be cancelled");

        let survey_start_time = self.storage.start_time.read();
        assert(current_time < survey_start_time, "survey already started");

        self.storage.cancel_reason_code.write(cancel_reason_code);
        self.storage.status.write(STATUS_CANCELLED);
    }

    #[external("public")]
    fn finalize_results(
        result_hash: Field,
        distribution_hash: Field,
        final_participant_count: Field,
        finalized_at: u64,
        current_time: u64,
    ) {
        let caller = self.msg_sender();
        let finalizer = self.storage.system_finalizer.read();
        assert(caller == finalizer, "only system finalizer can finalize");

        let current_status = self.storage.status.read();
        assert(current_status == STATUS_ACTIVE, "survey is not active");

        let survey_end_time = self.storage.end_time.read();
        assert(current_time >= survey_end_time, "survey not ended yet");
        assert(finalized_at >= survey_end_time, "invalid finalized_at");
        assert(finalized_at == current_time, "finalized_at mismatch");
        assert(result_hash != 0, "invalid result hash");
        assert(distribution_hash != 0, "invalid distribution hash");

        let participation_gate = self.storage.participation_gate.read();
        let survey_key = self.storage.survey_key.read();

        self.call(
            ParticipationGateV2::at(participation_gate)
                .assert_survey_participation_count(survey_key, final_participant_count),
        );

        self.storage.result_hash.write(result_hash);
        self.storage.distribution_hash.write(distribution_hash);
        self.storage.final_participant_count.write(final_participant_count);
        self.storage.finalized_at.write(finalized_at);
        self.storage.status.write(STATUS_FINALIZED);
    }

    #[external("utility")]
    unconstrained fn get_sponsor() -> pub AztecAddress {
        self.storage.sponsor.read()
    }

    #[external("utility")]
    unconstrained fn get_treasury() -> pub AztecAddress {
        self.storage.treasury.read()
    }

    #[external("utility")]
    unconstrained fn get_system_finalizer() -> pub AztecAddress {
        self.storage.system_finalizer.read()
    }

    #[external("utility")]
    unconstrained fn get_participation_gate() -> pub AztecAddress {
        self.storage.participation_gate.read()
    }

    #[external("utility")]
    unconstrained fn get_survey_key() -> pub Field {
        self.storage.survey_key.read()
    }

    #[external("utility")]
    unconstrained fn get_metadata_hash() -> pub Field {
        self.storage.metadata_hash.read()
    }

    #[external("utility")]
    unconstrained fn get_predicate_policy_hash() -> pub Field {
        self.storage.predicate_policy_hash.read()
    }

    #[external("utility")]
    unconstrained fn get_start_time() -> pub u64 {
        self.storage.start_time.read()
    }

    #[external("utility")]
    unconstrained fn get_end_time() -> pub u64 {
        self.storage.end_time.read()
    }

    #[external("utility")]
    unconstrained fn get_result_hash() -> pub Field {
        self.storage.result_hash.read()
    }

    #[external("utility")]
    unconstrained fn get_distribution_hash() -> pub Field {
        self.storage.distribution_hash.read()
    }

    #[external("utility")]
    unconstrained fn get_finalized_at() -> pub u64 {
        self.storage.finalized_at.read()
    }

    #[external("utility")]
    unconstrained fn get_reward_pool_amount() -> pub Field {
        self.storage.reward_pool_amount.read()
    }

    #[external("utility")]
    unconstrained fn get_claim_deadline() -> pub Field {
        self.storage.claim_deadline.read()
    }

    #[external("utility")]
    unconstrained fn get_reward_enabled() -> pub Field {
        self.storage.reward_enabled.read()
    }

    #[external("utility")]
    unconstrained fn get_minimum_sample_target() -> pub Field {
        self.storage.minimum_sample_target.read()
    }

    #[external("utility")]
    unconstrained fn get_final_participant_count() -> pub Field {
        self.storage.final_participant_count.read()
    }

    #[external("utility")]
    unconstrained fn get_analytics_min_total_sample() -> pub Field {
        self.storage.analytics_min_total_sample.read()
    }

    #[external("utility")]
    unconstrained fn get_analytics_min_segment_sample() -> pub Field {
        self.storage.analytics_min_segment_sample.read()
    }

    #[external("utility")]
    unconstrained fn get_analytics_visibility_mode() -> pub Field {
        self.storage.analytics_visibility_mode.read()
    }

    #[external("utility")]
    unconstrained fn get_cancel_reason_code() -> pub Field {
        self.storage.cancel_reason_code.read()
    }

    #[external("utility")]
    unconstrained fn get_status() -> pub Field {
        self.storage.status.read()
    }
}
