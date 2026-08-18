use aztec::macros::aztec;

#[aztec]
pub contract SurveyFactory {
    use aztec::{
        macros::{
            functions::{external, initializer, internal},
            storage::storage,
        },
        protocol::address::AztecAddress,
        state_vars::{Map, PublicMutable},
    };

    #[storage]
    struct Storage<Context> {
        registry_operator: PublicMutable<AztecAddress, Context>,
        system_finalizer: PublicMutable<AztecAddress, Context>,
        survey_count: PublicMutable<Field, Context>,

        survey_address_by_id: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
        sponsor_by_id: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
        created_at_by_id: Map<Field, PublicMutable<u64, Context>, Context>,

        survey_id_by_address: Map<AztecAddress, PublicMutable<Field, Context>, Context>,

        survey_id_by_key: Map<Field, PublicMutable<Field, Context>, Context>,
        survey_key_by_id: Map<Field, PublicMutable<Field, Context>, Context>,
        survey_address_by_key: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
        participation_gate_by_key: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
        reward_vault_by_key: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
        predicate_policy_hash_by_key: Map<Field, PublicMutable<Field, Context>, Context>,
        sponsor_by_key: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
        created_at_by_key: Map<Field, PublicMutable<u64, Context>, Context>,

        // Stronger MVP registry fields used by the real ParticipationGateV2 flow.
        metadata_hash_by_key: Map<Field, PublicMutable<Field, Context>, Context>,
        start_time_by_key: Map<Field, PublicMutable<u64, Context>, Context>,
        end_time_by_key: Map<Field, PublicMutable<u64, Context>, Context>,
        system_finalizer_by_key: Map<Field, PublicMutable<AztecAddress, Context>, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(
        registry_operator: AztecAddress,
        system_finalizer: AztecAddress,
    ) {
        assert(registry_operator != AztecAddress::zero(), "invalid registry operator");
        assert(system_finalizer != AztecAddress::zero(), "invalid finalizer");

        self.storage.registry_operator.write(registry_operator);
        self.storage.system_finalizer.write(system_finalizer);
        self.storage.survey_count.write(0);
    }

    #[external("public")]
    fn register_survey(
        survey_address: AztecAddress,
        sponsor: AztecAddress,
        created_at: u64,
    ) {
        let caller = self.msg_sender();
        let operator = self.storage.registry_operator.read();
        assert(caller == operator, "only registry operator can register");

        assert(survey_address != AztecAddress::zero(), "invalid survey address");
        assert(sponsor != AztecAddress::zero(), "invalid sponsor");
        assert(created_at > 0, "invalid created_at");

        let existing_id = self.storage.survey_id_by_address.at(survey_address).read();
        assert(existing_id == 0, "survey already registered");

        let current_count = self.storage.survey_count.read();
        let next_id = current_count + 1;

        self.storage.survey_address_by_id.at(next_id).write(survey_address);
        self.storage.sponsor_by_id.at(next_id).write(sponsor);
        self.storage.created_at_by_id.at(next_id).write(created_at);
        self.storage.survey_id_by_address.at(survey_address).write(next_id);

        self.storage.survey_count.write(next_id);
    }

   
    #[external("public")]
    fn register_survey_with_key(
        survey_key: Field,
        survey_address: AztecAddress,
        participation_gate: AztecAddress,
        reward_vault: AztecAddress,
        predicate_policy_hash: Field,
        sponsor: AztecAddress,
        created_at: u64,
    ) {
        self.internal._register_survey_record(
            survey_key,
            survey_address,
            participation_gate,
            reward_vault,
            predicate_policy_hash,
            sponsor,
            0,
            0,
            0,
            self.storage.system_finalizer.read(),
            created_at,
        );
    }

    #[external("public")]
    fn register_survey_with_config(
        survey_key: Field,
        survey_address: AztecAddress,
        participation_gate: AztecAddress,
        reward_vault: AztecAddress,
        predicate_policy_hash: Field,
        sponsor: AztecAddress,
        metadata_hash: Field,
        start_time: u64,
        end_time: u64,
        system_finalizer: AztecAddress,
        created_at: u64,
    ) {
        assert(metadata_hash != 0, "invalid metadata hash");
        assert(end_time >= start_time, "invalid survey time range");
        assert(system_finalizer != AztecAddress::zero(), "invalid finalizer");

        let canonical_finalizer = self.storage.system_finalizer.read();
        assert(system_finalizer == canonical_finalizer, "finalizer mismatch");

        self.internal._register_survey_record(
            survey_key,
            survey_address,
            participation_gate,
            reward_vault,
            predicate_policy_hash,
            sponsor,
            metadata_hash,
            start_time,
            end_time,
            system_finalizer,
            created_at,
        );
    }

    #[internal("public")]
    fn _register_survey_record(
        survey_key: Field,
        survey_address: AztecAddress,
        participation_gate: AztecAddress,
        reward_vault: AztecAddress,
        predicate_policy_hash: Field,
        sponsor: AztecAddress,
        metadata_hash: Field,
        start_time: u64,
        end_time: u64,
        system_finalizer: AztecAddress,
        created_at: u64,
    ) {
        let caller = self.msg_sender();
        let operator = self.storage.registry_operator.read();
        assert(caller == operator, "only registry operator can register");

        assert(survey_key != 0, "invalid survey key");
        assert(survey_address != AztecAddress::zero(), "invalid survey address");
        assert(participation_gate != AztecAddress::zero(), "invalid participation gate");
        assert(predicate_policy_hash != 0, "invalid policy hash");
        assert(sponsor != AztecAddress::zero(), "invalid sponsor");
        assert(system_finalizer != AztecAddress::zero(), "invalid finalizer");
        assert(created_at > 0, "invalid created_at");

        let existing_id_by_address = self.storage.survey_id_by_address.at(survey_address).read();
        assert(existing_id_by_address == 0, "survey address already registered");

        let existing_id_by_key = self.storage.survey_id_by_key.at(survey_key).read();
        assert(existing_id_by_key == 0, "survey key already registered");

        let current_count = self.storage.survey_count.read();
        let next_id = current_count + 1;

        self.storage.survey_address_by_id.at(next_id).write(survey_address);
        self.storage.sponsor_by_id.at(next_id).write(sponsor);
        self.storage.created_at_by_id.at(next_id).write(created_at);
        self.storage.survey_id_by_address.at(survey_address).write(next_id);

        self.storage.survey_id_by_key.at(survey_key).write(next_id);
        self.storage.survey_key_by_id.at(next_id).write(survey_key);
        self.storage.survey_address_by_key.at(survey_key).write(survey_address);
        self.storage.participation_gate_by_key.at(survey_key).write(participation_gate);
        self.storage.reward_vault_by_key.at(survey_key).write(reward_vault);
        self.storage.predicate_policy_hash_by_key.at(survey_key).write(predicate_policy_hash);
        self.storage.sponsor_by_key.at(survey_key).write(sponsor);
        self.storage.created_at_by_key.at(survey_key).write(created_at);

        self.storage.metadata_hash_by_key.at(survey_key).write(metadata_hash);
        self.storage.start_time_by_key.at(survey_key).write(start_time);
        self.storage.end_time_by_key.at(survey_key).write(end_time);
        self.storage.system_finalizer_by_key.at(survey_key).write(system_finalizer);

        self.storage.survey_count.write(next_id);
    }

    #[external("public")]
    fn update_system_finalizer(new_system_finalizer: AztecAddress) {
        let caller = self.msg_sender();
        let operator = self.storage.registry_operator.read();
        assert(caller == operator, "only registry operator can update");

        assert(new_system_finalizer != AztecAddress::zero(), "invalid finalizer");
        self.storage.system_finalizer.write(new_system_finalizer);
    }

    #[external("utility")]
    unconstrained fn get_registry_operator() -> pub AztecAddress {
        self.storage.registry_operator.read()
    }

    #[external("utility")]
    unconstrained fn get_system_finalizer() -> pub AztecAddress {
        self.storage.system_finalizer.read()
    }

    #[external("utility")]
    unconstrained fn get_survey_count() -> pub Field {
        self.storage.survey_count.read()
    }

    #[external("utility")]
    unconstrained fn get_latest_survey_id() -> pub Field {
        self.storage.survey_count.read()
    }

    #[external("utility")]
    unconstrained fn get_survey_address_by_id(survey_id: Field) -> pub AztecAddress {
        self.storage.survey_address_by_id.at(survey_id).read()
    }

    #[external("utility")]
    unconstrained fn get_sponsor_by_id(survey_id: Field) -> pub AztecAddress {
        self.storage.sponsor_by_id.at(survey_id).read()
    }

    #[external("utility")]
    unconstrained fn get_created_at_by_id(survey_id: Field) -> pub u64 {
        self.storage.created_at_by_id.at(survey_id).read()
    }

    #[external("utility")]
    unconstrained fn get_survey_id_by_address(survey_address: AztecAddress) -> pub Field {
        self.storage.survey_id_by_address.at(survey_address).read()
    }

    #[external("utility")]
    unconstrained fn get_survey_id_by_key(survey_key: Field) -> pub Field {
        self.storage.survey_id_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_survey_key_by_id(survey_id: Field) -> pub Field {
        self.storage.survey_key_by_id.at(survey_id).read()
    }

    #[external("utility")]
    unconstrained fn get_survey_address_by_key(survey_key: Field) -> pub AztecAddress {
        self.storage.survey_address_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_participation_gate_by_key(survey_key: Field) -> pub AztecAddress {
        self.storage.participation_gate_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_reward_vault_by_key(survey_key: Field) -> pub AztecAddress {
        self.storage.reward_vault_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_predicate_policy_hash_by_key(survey_key: Field) -> pub Field {
        self.storage.predicate_policy_hash_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_sponsor_by_key(survey_key: Field) -> pub AztecAddress {
        self.storage.sponsor_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_created_at_by_key(survey_key: Field) -> pub u64 {
        self.storage.created_at_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_metadata_hash_by_key(survey_key: Field) -> pub Field {
        self.storage.metadata_hash_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_start_time_by_key(survey_key: Field) -> pub u64 {
        self.storage.start_time_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_end_time_by_key(survey_key: Field) -> pub u64 {
        self.storage.end_time_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_system_finalizer_by_key(survey_key: Field) -> pub AztecAddress {
        self.storage.system_finalizer_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn is_registered(survey_address: AztecAddress) -> pub bool {
        let survey_id = self.storage.survey_id_by_address.at(survey_address).read();
        survey_id != 0
    }

    #[external("utility")]
    unconstrained fn is_survey_key_registered(survey_key: Field) -> pub bool {
        let survey_id = self.storage.survey_id_by_key.at(survey_key).read();
        survey_id != 0
    }
}
