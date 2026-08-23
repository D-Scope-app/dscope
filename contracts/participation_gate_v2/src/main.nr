use aztec::macros::aztec;

pub mod credential;
pub mod participation_receipt;
pub mod participation_consumption;

#[aztec]
pub contract ParticipationGateV2 {
    use crate::credential::CredentialNote;
    use crate::participation_receipt::ParticipationReceiptNote;
    use crate::participation_consumption::ParticipationConsumptionNote;

    use aztec::{
        macros::{
            functions::{external, initializer, internal, only_self},
            storage::storage,
        },
        messages::delivery::MessageDelivery,
        note::{
            note_getter_options::NoteGetterOptions,
            note_viewer_options::NoteViewerOptions,
        },
        protocol::address::AztecAddress,
        state_vars::{Map, Owned, PrivateSet, PublicImmutable, PublicMutable},
    };

    global POLICY_MODE_ANY: u64 = 0;
    global POLICY_MODE_ALLOWLIST: u64 = 1;

    global POLICY_NOT_CONFIGURED: u64 = 0;
    global POLICY_CONFIGURED: u64 = 1;

    #[storage]
    struct Storage<Context> {
        issuer: PublicImmutable<AztecAddress, Context>,

        credentials: Owned<PrivateSet<CredentialNote, Context>, Context>,
        participation_receipts: Owned<PrivateSet<ParticipationReceiptNote, Context>, Context>,
        participation_consumptions: Owned<PrivateSet<ParticipationConsumptionNote, Context>, Context>,

        survey_participation_count: Map<Field, PublicMutable<Field, Context>, Context>,

        survey_policy_hash_by_key: Map<Field, PublicImmutable<Field, Context>, Context>,

        survey_age_mode_by_key: Map<Field, PublicImmutable<u64, Context>, Context>,
        survey_age_mask_by_key: Map<Field, PublicImmutable<u64, Context>, Context>,

        survey_country_mode_by_key: Map<Field, PublicImmutable<u64, Context>, Context>,
        survey_country_bitmap_by_key: Map<Field, PublicImmutable<[u64; 16], Context>, Context>,

        survey_start_time_by_key: Map<Field, PublicImmutable<u64, Context>, Context>,
        survey_end_time_by_key: Map<Field, PublicImmutable<u64, Context>, Context>,

        survey_policy_configured_by_key: Map<Field, PublicMutable<u64, Context>, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(issuer: AztecAddress) {
        assert(issuer != AztecAddress::zero(), "invalid issuer");
        self.storage.issuer.initialize(issuer);
    }

    #[external("public")]
    fn register_survey_window(
        survey_key: Field,
        start_time: u64,
        end_time: u64,
    ) {
        self.internal.assert_issuer();
        assert(survey_key != 0, "invalid survey key");
        assert(start_time > 0, "invalid survey start time");
        assert(end_time > start_time, "invalid survey time range");

        let existing_start_time = self.storage
            .survey_start_time_by_key
            .at(survey_key)
            .read_unsafe();
        let existing_end_time = self.storage
            .survey_end_time_by_key
            .at(survey_key)
            .read_unsafe();

        if existing_start_time == 0 {
            assert(existing_end_time == 0, "incomplete survey window");
            self.storage
                .survey_start_time_by_key
                .at(survey_key)
                .initialize(start_time);
            self.storage
                .survey_end_time_by_key
                .at(survey_key)
                .initialize(end_time);
        } else {
            assert(existing_start_time == start_time, "survey start time mismatch");
            assert(existing_end_time == end_time, "survey end time mismatch");
        }
    }

    #[external("public")]
    fn register_survey_policy(
        survey_key: Field,
        policy_hash: Field,
        age_mode: u64,
        age_mask: u64,
        country_mode: u64,
        country_bitmap: [u64; 16],
    ) {
        self.internal.assert_issuer();
        self.internal.assert_policy_mode(age_mode);
        self.internal.assert_policy_mode(country_mode);

        assert(survey_key != 0, "invalid survey key");
        assert(policy_hash != 0, "invalid policy hash");
        self.internal.assert_survey_window_configured(survey_key);

        let configured = self.storage.survey_policy_configured_by_key.at(survey_key).read();
        assert(configured == POLICY_NOT_CONFIGURED, "survey policy already configured");

        if age_mode == POLICY_MODE_ALLOWLIST {
            assert(age_mask != 0, "empty age allowlist");
        }

        if country_mode == POLICY_MODE_ALLOWLIST {
            assert(self.internal.country_bitmap_has_any_bit(country_bitmap), "empty country allowlist");
        }

        self.storage
            .survey_policy_hash_by_key
            .at(survey_key)
            .initialize(policy_hash);

        self.storage
            .survey_age_mode_by_key
            .at(survey_key)
            .initialize(age_mode);

        self.storage
            .survey_age_mask_by_key
            .at(survey_key)
            .initialize(age_mask);

        self.storage
            .survey_country_mode_by_key
            .at(survey_key)
            .initialize(country_mode);

        self.storage
            .survey_country_bitmap_by_key
            .at(survey_key)
            .initialize(country_bitmap);

        self.storage
            .survey_policy_configured_by_key
            .at(survey_key)
            .write(POLICY_CONFIGURED);
    }

    
    #[external("public")]
    fn register_policy_hash(
        survey_key: Field,
        policy_hash: Field,
    ) {
        self.internal.assert_issuer();
        assert(survey_key != 0, "invalid survey key");
        assert(policy_hash != 0, "invalid policy hash");

        self.storage
            .survey_policy_hash_by_key
            .at(survey_key)
            .initialize(policy_hash);
    }

    #[external("public")]
    fn register_age_mode(
        survey_key: Field,
        age_mode: u64,
    ) {
        self.internal.assert_issuer();
        assert(survey_key != 0, "invalid survey key");
        self.internal.assert_policy_mode(age_mode);

        self.storage
            .survey_age_mode_by_key
            .at(survey_key)
            .initialize(age_mode);
    }

    #[external("public")]
    fn register_age_mask(
        survey_key: Field,
        age_mask: u64,
    ) {
        self.internal.assert_issuer();
        assert(survey_key != 0, "invalid survey key");

        self.storage
            .survey_age_mask_by_key
            .at(survey_key)
            .initialize(age_mask);
    }

    #[external("public")]
    fn register_country_mode(
        survey_key: Field,
        country_mode: u64,
    ) {
        self.internal.assert_issuer();
        assert(survey_key != 0, "invalid survey key");
        self.internal.assert_policy_mode(country_mode);

        self.storage
            .survey_country_mode_by_key
            .at(survey_key)
            .initialize(country_mode);
    }

    #[external("public")]
    fn register_country_bitmap(
        survey_key: Field,
        country_bitmap: [u64; 16],
    ) {
        self.internal.assert_issuer();
        assert(survey_key != 0, "invalid survey key");

        self.storage
            .survey_country_bitmap_by_key
            .at(survey_key)
            .initialize(country_bitmap);
    }

    #[external("public")]
    fn activate_policy_config(survey_key: Field) {
        self.internal.assert_issuer();
        assert(survey_key != 0, "invalid survey key");
        self.internal.assert_survey_window_configured(survey_key);

        let registered_policy_hash = self.storage
            .survey_policy_hash_by_key
            .at(survey_key)
            .read();
        assert(registered_policy_hash != 0, "survey policy is not registered");

        let age_mode = self.storage.survey_age_mode_by_key.at(survey_key).read();
        let country_mode = self.storage.survey_country_mode_by_key.at(survey_key).read();
        self.internal.assert_policy_mode(age_mode);
        self.internal.assert_policy_mode(country_mode);

        let age_mask = self.storage.survey_age_mask_by_key.at(survey_key).read();
        if age_mode == POLICY_MODE_ALLOWLIST {
            assert(age_mask != 0, "empty age allowlist");
        }

        let country_bitmap: [u64; 16] = self.storage
            .survey_country_bitmap_by_key
            .at(survey_key)
            .read();
        if country_mode == POLICY_MODE_ALLOWLIST {
            assert(self.internal.country_bitmap_has_any_bit(country_bitmap), "empty country allowlist");
        }

        let configured = self.storage.survey_policy_configured_by_key.at(survey_key).read();
        assert(configured == POLICY_NOT_CONFIGURED, "survey policy already configured");
        self.storage
            .survey_policy_configured_by_key
            .at(survey_key)
            .write(POLICY_CONFIGURED);
    }

    #[external("public")]
    #[only_self]
    fn _validate_window_and_increment_participation_count(survey_key: Field) {
        let policy_configured = self.storage
            .survey_policy_configured_by_key
            .at(survey_key)
            .read();
        assert(policy_configured == POLICY_CONFIGURED, "survey policy is not active");

        let current_time = self.context.timestamp();
        let start_time = self.storage.survey_start_time_by_key.at(survey_key).read();
        let end_time = self.storage.survey_end_time_by_key.at(survey_key).read();

        assert(start_time > 0, "survey window is not registered");
        assert(end_time > start_time, "invalid survey time range");
        assert(current_time >= start_time, "survey has not started");
        assert(current_time < end_time, "survey has ended");

        let current = self.storage.survey_participation_count.at(survey_key).read();
        self.storage.survey_participation_count.at(survey_key).write(current + 1);
    }

    #[external("private")]
    fn store_credential(
        to: AztecAddress,
        age_bucket: u64,
        country_bucket: u64,
        world_region: u64,
        valid_until: u64,
        source_tag: Field,
        credential_version: Field,
    ) {
        assert(
            self.storage.issuer.read().eq(self.msg_sender()),
            "caller is not the authorized issuer",
        );

        assert(to != AztecAddress::zero(), "invalid credential receiver");
        assert(age_bucket < 64, "invalid age bucket");
        assert(country_bucket < 1024, "invalid country bucket");
        assert(world_region < 64, "invalid world region");
        assert(valid_until > 0, "invalid valid_until");
        assert(source_tag != 0, "invalid source tag");
        assert(credential_version != 0, "invalid credential version");

        let credential = CredentialNote {
            age_bucket,
            country_bucket,
            world_region,
            valid_until,
            source_tag,
            credential_version,
        };

        self.storage
            .credentials
            .at(to)
            .insert(credential)
            .deliver(MessageDelivery::onchain_constrained());
    }

    #[external("private")]
    fn participate(
        survey_key: Field,
        expected_policy_hash: Field,
        current_time: u64,
    ) {
        assert(survey_key != 0, "invalid survey key");
        assert(expected_policy_hash != 0, "invalid expected policy hash");
        assert(current_time > 0, "invalid current_time");

        let participant = self.msg_sender();

        let registered_policy_hash = self.storage
            .survey_policy_hash_by_key
            .at(survey_key)
            .read();

        assert(registered_policy_hash != 0, "survey policy is not registered");
        assert(
            registered_policy_hash == expected_policy_hash,
            "policy hash mismatch",
        );

        let credential_notes = self.storage
            .credentials
            .at(participant)
            .get_notes(NoteGetterOptions::new());

        assert(credential_notes.len() > 0, "no credential found");

        let credential_note = credential_notes.get_unchecked(0).note;

        // The caller-supplied current_time is retained only as receipt metadata.
        // It is never trusted for authorization. The credential must cover the
        // full immutable survey window, while the enqueued public call below
        // checks the live block timestamp at transaction execution.
        let survey_end_time = self.storage.survey_end_time_by_key.at(survey_key).read();
        assert(survey_end_time > 0, "survey window is not registered");
        assert(
            credential_note.valid_until >= survey_end_time,
            "credential expires before survey ends",
        );

        let age_mode = self.storage.survey_age_mode_by_key.at(survey_key).read();
        let age_mask = self.storage.survey_age_mask_by_key.at(survey_key).read();

        if age_mode == POLICY_MODE_ANY {
            
        } else if age_mode == POLICY_MODE_ALLOWLIST {
            assert(credential_note.age_bucket < 64, "invalid age bucket bit");

            let mut age_divisor: u64 = 1;

            for i in 0..64 {
                if i < credential_note.age_bucket {
                    age_divisor = age_divisor * 2;
                }
            }

            let shifted_age_mask = age_mask / age_divisor;
            let allowed_age_bit = shifted_age_mask % 2;

            assert(allowed_age_bit == 1, "age policy mismatch");
        } else {
            assert(false, "invalid age mode");
        }

        let country_mode = self.storage.survey_country_mode_by_key.at(survey_key).read();

        if country_mode == POLICY_MODE_ANY {
            
        } else if country_mode == POLICY_MODE_ALLOWLIST {
            let country_bitmap: [u64; 16] = self.storage
                .survey_country_bitmap_by_key
                .at(survey_key)
                .read();

            let chunk_index = credential_note.country_bucket / 64;
            let bit_index = credential_note.country_bucket % 64;

            assert(chunk_index < 16, "country code out of bitmap range");

            let country_chunk = country_bitmap[chunk_index as u32];

            let mut country_divisor: u64 = 1;

            for i in 0..64 {
                if i < bit_index {
                    country_divisor = country_divisor * 2;
                }
            }

            let shifted_country_chunk = country_chunk / country_divisor;
            let allowed_country_bit = shifted_country_chunk % 2;

            assert(allowed_country_bit == 1, "country policy mismatch");
        } else {
            assert(false, "invalid country mode");
        }

        let consumption_options = NoteGetterOptions::new().set_limit(16);

        let existing_consumptions = self.storage
            .participation_consumptions
            .at(participant)
            .get_notes(consumption_options);

        for i in 0..16 {
            if i < existing_consumptions.len() {
                let existing_consumption = existing_consumptions.get_unchecked(i).note;
                assert(
                    existing_consumption.survey_key != survey_key,
                    "participant already consumed participation right for this survey",
                );
            }
        }

        let receipt = ParticipationReceiptNote {
            survey_key,
            policy_hash: expected_policy_hash,
            participated_at: current_time,
        };

        self.storage
            .participation_receipts
            .at(participant)
            .insert(receipt)
            .deliver(MessageDelivery::onchain_constrained());

        let consumption = ParticipationConsumptionNote {
            survey_key,
            consumed_at: current_time,
        };

        self.storage
            .participation_consumptions
            .at(participant)
            .insert(consumption)
            .deliver(MessageDelivery::onchain_constrained());

        self.enqueue_self._validate_window_and_increment_participation_count(survey_key);
    }

    #[internal("public")]
    fn assert_issuer() {
        assert(
            self.storage.issuer.read().eq(self.msg_sender()),
            "caller is not the authorized issuer",
        );
    }

    #[internal("public")]
    fn assert_policy_mode(mode: u64) {
        if mode == POLICY_MODE_ANY {
            // Valid.
        } else if mode == POLICY_MODE_ALLOWLIST {
            // Valid.
        } else {
            assert(false, "invalid policy mode");
        }
    }

    #[internal("public")]
    fn country_bitmap_has_any_bit(country_bitmap: [u64; 16]) -> pub bool {
        let mut has_any_bit = false;
        for i in 0..16 {
            if country_bitmap[i] != 0 {
                has_any_bit = true;
            }
        }
        has_any_bit
    }

    #[internal("public")]
    fn assert_survey_window_configured(survey_key: Field) {
        let start_time = self.storage.survey_start_time_by_key.at(survey_key).read();
        let end_time = self.storage.survey_end_time_by_key.at(survey_key).read();
        assert(start_time > 0, "survey window is not registered");
        assert(end_time > start_time, "invalid survey time range");
    }


    #[external("public")]
    fn assert_survey_participation_count(
        survey_key: Field,
        expected_count: Field,
    ) {
        assert(survey_key != 0, "invalid survey key");

        let actual_count = self.storage.survey_participation_count.at(survey_key).read();
        assert(actual_count == expected_count, "participant count mismatch");
    }

    #[external("utility")]
    unconstrained fn get_issuer() -> pub AztecAddress {
        self.storage.issuer.read()
    }

    #[external("utility")]
    unconstrained fn notes_of(owner: AztecAddress) -> pub Field {
        let notes = self.storage
            .credentials
            .at(owner)
            .view_notes(NoteViewerOptions::new());

        notes.len() as Field
    }

    #[external("utility")]
    unconstrained fn receipt_count_of(owner: AztecAddress) -> pub Field {
        let receipts = self.storage
            .participation_receipts
            .at(owner)
            .view_notes(NoteViewerOptions::new());

        receipts.len() as Field
    }

    #[external("utility")]
    unconstrained fn consumption_count_of(owner: AztecAddress) -> pub Field {
        let consumptions = self.storage
            .participation_consumptions
            .at(owner)
            .view_notes(NoteViewerOptions::new());

        consumptions.len() as Field
    }

    #[external("utility")]
    unconstrained fn get_survey_participation_count(survey_key: Field) -> pub Field {
        self.storage.survey_participation_count.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_survey_policy_hash(survey_key: Field) -> pub Field {
        self.storage.survey_policy_hash_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_policy_configured(survey_key: Field) -> pub u64 {
        self.storage.survey_policy_configured_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_survey_start_time(survey_key: Field) -> pub u64 {
        self.storage.survey_start_time_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_survey_end_time(survey_key: Field) -> pub u64 {
        self.storage.survey_end_time_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_age_mode(survey_key: Field) -> pub u64 {
        self.storage.survey_age_mode_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_age_mask(survey_key: Field) -> pub u64 {
        self.storage.survey_age_mask_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_country_mode(survey_key: Field) -> pub u64 {
        self.storage.survey_country_mode_by_key.at(survey_key).read()
    }

    #[external("utility")]
    unconstrained fn get_country_bitmap_chunk(
        survey_key: Field,
        chunk_index: u64,
    ) -> pub u64 {
        assert(chunk_index < 16, "country bitmap chunk out of range");

        let country_bitmap: [u64; 16] = self.storage
            .survey_country_bitmap_by_key
            .at(survey_key)
            .read();

        country_bitmap[chunk_index as u32]
    }
}
