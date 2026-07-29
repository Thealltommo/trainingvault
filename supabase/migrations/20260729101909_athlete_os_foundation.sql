-- TrainVault athlete operating system foundation.
--
-- The existing public.trainvault_state table is intentionally not referenced or
-- modified. It remains the compatibility store while data is migrated into the
-- athlete-owned relational model below.

create table public.athletes (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'Europe/London',
  unit_system text not null default 'metric',
  profile jsonb not null default '{}'::jsonb,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athletes_display_name_not_blank
    check (display_name is null or btrim(display_name) <> ''),
  constraint athletes_timezone_not_blank
    check (btrim(timezone) <> ''),
  constraint athletes_unit_system_valid
    check (unit_system in ('metric', 'imperial')),
  constraint athletes_profile_is_object
    check (jsonb_typeof(profile) = 'object')
);

comment on table public.athletes is
  'Private TrainVault athlete profiles keyed one-to-one to Supabase Auth users.';

create table public.athlete_settings (
  athlete_id uuid primary key references public.athletes (id) on delete cascade,
  running_days_per_week smallint,
  max_weekly_training_days smallint not null default 6,
  preferred_long_run_day smallint,
  current_5k_seconds integer,
  current_10k_seconds integer,
  training_age_years numeric(4, 1),
  recent_weekly_distance_m numeric(12, 2),
  recent_weekly_elevation_gain_m numeric(12, 2),
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint athlete_settings_running_days_valid
    check (running_days_per_week is null or running_days_per_week between 1 and 7),
  constraint athlete_settings_max_days_valid
    check (max_weekly_training_days between 1 and 7),
  constraint athlete_settings_long_run_day_valid
    check (preferred_long_run_day is null or preferred_long_run_day between 0 and 6),
  constraint athlete_settings_current_5k_valid
    check (current_5k_seconds is null or current_5k_seconds > 0),
  constraint athlete_settings_current_10k_valid
    check (current_10k_seconds is null or current_10k_seconds > 0),
  constraint athlete_settings_training_age_valid
    check (training_age_years is null or training_age_years >= 0),
  constraint athlete_settings_recent_distance_valid
    check (recent_weekly_distance_m is null or recent_weekly_distance_m >= 0),
  constraint athlete_settings_recent_elevation_valid
    check (
      recent_weekly_elevation_gain_m is null
      or recent_weekly_elevation_gain_m >= 0
    ),
  constraint athlete_settings_preferences_is_object
    check (jsonb_typeof(preferences) = 'object')
);

create table public.training_goals (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  goal_type text not null,
  title text not null,
  target_date date,
  target_value jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  priority smallint not null default 3,
  notes text,
  source text not null default 'manual',
  source_id text,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_goals_owner_key unique (id, athlete_id),
  constraint training_goals_type_valid
    check (
      goal_type in (
        'performance',
        'distance',
        'elevation',
        'consistency',
        'event',
        'recovery',
        'strength',
        'custom'
      )
    ),
  constraint training_goals_title_not_blank
    check (btrim(title) <> ''),
  constraint training_goals_target_value_is_object
    check (jsonb_typeof(target_value) = 'object'),
  constraint training_goals_status_valid
    check (status in ('draft', 'active', 'paused', 'achieved', 'cancelled', 'archived')),
  constraint training_goals_priority_valid
    check (priority between 1 and 5),
  constraint training_goals_source_not_blank
    check (btrim(source) <> ''),
  constraint training_goals_source_id_not_blank
    check (source_id is null or btrim(source_id) <> ''),
  constraint training_goals_legacy_id_not_blank
    check (legacy_id is null or btrim(legacy_id) <> '')
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  goal_id uuid,
  name text not null,
  event_type text not null,
  starts_on date not null,
  ends_on date,
  starts_at timestamptz,
  priority text not null default 'C',
  location text,
  distance_m numeric(12, 2),
  elevation_gain_m numeric(12, 2),
  goal jsonb not null default '{}'::jsonb,
  notes text,
  source text not null default 'manual',
  source_id text,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_owner_key unique (id, athlete_id),
  constraint events_goal_owner_fk
    foreign key (goal_id, athlete_id)
    references public.training_goals (id, athlete_id)
    on delete no action
    deferrable initially deferred,
  constraint events_name_not_blank
    check (btrim(name) <> ''),
  constraint events_type_valid
    check (
      event_type in (
        '5k',
        '10k',
        'half_marathon',
        'marathon',
        'crossfit_competition',
        'hyrox',
        'spartan_sprint',
        'spartan_super',
        'spartan_beast',
        'spartan_weekend',
        'fell_race',
        'trail_race',
        'custom'
      )
    ),
  constraint events_dates_valid
    check (ends_on is null or ends_on >= starts_on),
  constraint events_priority_valid
    check (priority in ('A', 'B', 'C')),
  constraint events_distance_valid
    check (distance_m is null or distance_m >= 0),
  constraint events_elevation_valid
    check (elevation_gain_m is null or elevation_gain_m >= 0),
  constraint events_goal_is_object
    check (jsonb_typeof(goal) = 'object'),
  constraint events_source_not_blank
    check (btrim(source) <> ''),
  constraint events_source_id_not_blank
    check (source_id is null or btrim(source_id) <> ''),
  constraint events_legacy_id_not_blank
    check (legacy_id is null or btrim(legacy_id) <> '')
);

create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  goal_id uuid,
  event_id uuid,
  name text not null,
  description text,
  status text not null default 'draft',
  starts_on date,
  ends_on date,
  original_plan jsonb not null default '{}'::jsonb,
  current_plan jsonb not null default '{}'::jsonb,
  source text not null default 'manual',
  source_id text,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_plans_owner_key unique (id, athlete_id),
  constraint training_plans_goal_owner_fk
    foreign key (goal_id, athlete_id)
    references public.training_goals (id, athlete_id)
    on delete no action
    deferrable initially deferred,
  constraint training_plans_event_owner_fk
    foreign key (event_id, athlete_id)
    references public.events (id, athlete_id)
    on delete no action
    deferrable initially deferred,
  constraint training_plans_name_not_blank
    check (btrim(name) <> ''),
  constraint training_plans_status_valid
    check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  constraint training_plans_dates_valid
    check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint training_plans_original_is_object
    check (jsonb_typeof(original_plan) = 'object'),
  constraint training_plans_current_is_object
    check (jsonb_typeof(current_plan) = 'object'),
  constraint training_plans_source_not_blank
    check (btrim(source) <> ''),
  constraint training_plans_source_id_not_blank
    check (source_id is null or btrim(source_id) <> ''),
  constraint training_plans_legacy_id_not_blank
    check (legacy_id is null or btrim(legacy_id) <> '')
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  training_plan_id uuid,
  event_id uuid,
  title text not null,
  session_type text not null,
  scheduled_on date not null,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'planned',
  selected_variant text not null default 'full',
  original_prescription jsonb not null default '{}'::jsonb,
  current_prescription jsonb not null default '{}'::jsonb,
  completed_result jsonb,
  modification_reason text,
  load_classification text[] not null default '{}'::text[],
  planned_training_cost numeric(8, 2),
  planned_duration_seconds integer,
  planned_distance_m numeric(12, 2),
  planned_elevation_gain_m numeric(12, 2),
  target_rpe numeric(3, 1),
  completed_at timestamptz,
  garmin_sync_state text not null default 'not_sent',
  garmin_workout_id text,
  garmin_schedule_id text,
  garmin_device_id text,
  garmin_last_error text,
  garmin_sync_attempted_at timestamptz,
  garmin_synced_at timestamptz,
  source text not null default 'manual',
  source_id text,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sessions_owner_key unique (id, athlete_id),
  constraint sessions_training_plan_owner_fk
    foreign key (training_plan_id, athlete_id)
    references public.training_plans (id, athlete_id)
    on delete no action
    deferrable initially deferred,
  constraint sessions_event_owner_fk
    foreign key (event_id, athlete_id)
    references public.events (id, athlete_id)
    on delete no action
    deferrable initially deferred,
  constraint sessions_title_not_blank
    check (btrim(title) <> ''),
  constraint sessions_type_valid
    check (
      session_type in (
        'run',
        'strength',
        'crossfit',
        'hawkeye',
        'conditioning',
        'hyrox',
        'fell_trail',
        'hike',
        'spartan_race',
        'race',
        'mobility',
        'recovery',
        'rest',
        'custom'
      )
    ),
  constraint sessions_times_valid
    check (ends_at is null or starts_at is null or ends_at >= starts_at),
  constraint sessions_status_valid
    check (status in ('planned', 'completed', 'skipped', 'modified', 'cancelled')),
  constraint sessions_variant_valid
    check (selected_variant in ('full', 'adjusted', 'minimum', 'custom')),
  constraint sessions_original_is_object
    check (jsonb_typeof(original_prescription) = 'object'),
  constraint sessions_current_is_object
    check (jsonb_typeof(current_prescription) = 'object'),
  constraint sessions_completed_is_object
    check (completed_result is null or jsonb_typeof(completed_result) = 'object'),
  constraint sessions_training_cost_valid
    check (planned_training_cost is null or planned_training_cost >= 0),
  constraint sessions_duration_valid
    check (planned_duration_seconds is null or planned_duration_seconds >= 0),
  constraint sessions_distance_valid
    check (planned_distance_m is null or planned_distance_m >= 0),
  constraint sessions_elevation_valid
    check (planned_elevation_gain_m is null or planned_elevation_gain_m >= 0),
  constraint sessions_target_rpe_valid
    check (target_rpe is null or target_rpe between 0 and 10),
  constraint sessions_garmin_state_valid
    check (
      garmin_sync_state in (
        'not_sent',
        'syncing',
        'scheduled',
        'sent_to_device',
        'error'
      )
    ),
  constraint sessions_garmin_workout_id_not_blank
    check (garmin_workout_id is null or btrim(garmin_workout_id) <> ''),
  constraint sessions_source_not_blank
    check (btrim(source) <> ''),
  constraint sessions_source_id_not_blank
    check (source_id is null or btrim(source_id) <> ''),
  constraint sessions_legacy_id_not_blank
    check (legacy_id is null or btrim(legacy_id) <> '')
);

create table public.session_blocks (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  session_id uuid not null,
  position integer not null,
  block_type text not null,
  title text,
  original_prescription jsonb not null default '{}'::jsonb,
  current_prescription jsonb not null default '{}'::jsonb,
  completed_result jsonb,
  source_id text,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_blocks_owner_key unique (id, athlete_id),
  constraint session_blocks_session_owner_fk
    foreign key (session_id, athlete_id)
    references public.sessions (id, athlete_id)
    on delete cascade,
  constraint session_blocks_position_key unique (session_id, position),
  constraint session_blocks_position_valid
    check (position >= 0),
  constraint session_blocks_type_valid
    check (
      block_type in (
        'warm_up',
        'work',
        'interval',
        'recovery',
        'strength',
        'metcon',
        'mobility',
        'cool_down',
        'custom'
      )
    ),
  constraint session_blocks_title_not_blank
    check (title is null or btrim(title) <> ''),
  constraint session_blocks_original_is_object
    check (jsonb_typeof(original_prescription) = 'object'),
  constraint session_blocks_current_is_object
    check (jsonb_typeof(current_prescription) = 'object'),
  constraint session_blocks_completed_is_object
    check (completed_result is null or jsonb_typeof(completed_result) = 'object'),
  constraint session_blocks_source_id_not_blank
    check (source_id is null or btrim(source_id) <> ''),
  constraint session_blocks_legacy_id_not_blank
    check (legacy_id is null or btrim(legacy_id) <> '')
);

create table public.session_variants (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  session_id uuid not null,
  variant_type text not null,
  title text not null,
  prescription jsonb not null default '{}'::jsonb,
  rationale text,
  planned_training_cost numeric(8, 2),
  is_recommended boolean not null default false,
  source_id text,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_variants_owner_key unique (id, athlete_id),
  constraint session_variants_session_owner_fk
    foreign key (session_id, athlete_id)
    references public.sessions (id, athlete_id)
    on delete cascade,
  constraint session_variants_type_key unique (session_id, variant_type),
  constraint session_variants_type_valid
    check (variant_type in ('full', 'adjusted', 'minimum', 'custom')),
  constraint session_variants_title_not_blank
    check (btrim(title) <> ''),
  constraint session_variants_prescription_is_object
    check (jsonb_typeof(prescription) = 'object'),
  constraint session_variants_training_cost_valid
    check (planned_training_cost is null or planned_training_cost >= 0),
  constraint session_variants_source_id_not_blank
    check (source_id is null or btrim(source_id) <> ''),
  constraint session_variants_legacy_id_not_blank
    check (legacy_id is null or btrim(legacy_id) <> '')
);

create table public.session_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  session_id uuid not null,
  log_status text not null default 'completed',
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds integer,
  distance_m numeric(12, 2),
  elevation_gain_m numeric(12, 2),
  rpe numeric(3, 1),
  subjective_feel text,
  soreness numeric(3, 1),
  notes text,
  original_prescription jsonb not null default '{}'::jsonb,
  current_prescription jsonb not null default '{}'::jsonb,
  completed_result jsonb not null default '{}'::jsonb,
  block_results jsonb not null default '[]'::jsonb,
  source text not null default 'manual',
  source_id text,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_logs_owner_key unique (id, athlete_id),
  constraint session_logs_session_owner_key unique (id, session_id, athlete_id),
  constraint session_logs_session_owner_fk
    foreign key (session_id, athlete_id)
    references public.sessions (id, athlete_id)
    on delete no action
    deferrable initially deferred,
  constraint session_logs_session_key unique (session_id),
  constraint session_logs_status_valid
    check (log_status in ('started', 'completed', 'partial', 'skipped', 'abandoned')),
  constraint session_logs_times_valid
    check (completed_at is null or started_at is null or completed_at >= started_at),
  constraint session_logs_duration_valid
    check (duration_seconds is null or duration_seconds >= 0),
  constraint session_logs_distance_valid
    check (distance_m is null or distance_m >= 0),
  constraint session_logs_elevation_valid
    check (elevation_gain_m is null or elevation_gain_m >= 0),
  constraint session_logs_rpe_valid
    check (rpe is null or rpe between 0 and 10),
  constraint session_logs_soreness_valid
    check (soreness is null or soreness between 0 and 10),
  constraint session_logs_original_is_object
    check (jsonb_typeof(original_prescription) = 'object'),
  constraint session_logs_current_is_object
    check (jsonb_typeof(current_prescription) = 'object'),
  constraint session_logs_completed_is_object
    check (jsonb_typeof(completed_result) = 'object'),
  constraint session_logs_blocks_is_array
    check (jsonb_typeof(block_results) = 'array'),
  constraint session_logs_source_not_blank
    check (btrim(source) <> ''),
  constraint session_logs_source_id_not_blank
    check (source_id is null or btrim(source_id) <> ''),
  constraint session_logs_legacy_id_not_blank
    check (legacy_id is null or btrim(legacy_id) <> '')
);

create table public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  provider text not null,
  status text not null default 'disconnected',
  external_account_id text,
  display_name text,
  scopes text[] not null default '{}'::text[],
  sync_cursor text,
  sync_state text not null default 'idle',
  last_synced_at timestamptz,
  next_sync_after timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_accounts_owner_key unique (id, athlete_id),
  constraint integration_accounts_provider_key unique (athlete_id, provider),
  constraint integration_accounts_provider_not_blank
    check (btrim(provider) <> ''),
  constraint integration_accounts_status_valid
    check (
      status in (
        'disconnected',
        'pending',
        'connected',
        'reauth_required',
        'disabled',
        'error'
      )
    ),
  constraint integration_accounts_external_id_not_blank
    check (external_account_id is null or btrim(external_account_id) <> ''),
  constraint integration_accounts_sync_state_valid
    check (sync_state in ('idle', 'syncing', 'complete', 'error', 'disabled')),
  constraint integration_accounts_metadata_is_object
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.integration_accounts is
  'Integration metadata and sync state only. Credentials, tokens, passwords, and service secrets must be stored outside this table.';

create table public.activity_records (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  integration_account_id uuid,
  session_id uuid,
  session_log_id uuid,
  activity_type text not null,
  title text,
  started_at timestamptz not null,
  duration_seconds integer,
  distance_m numeric(12, 2),
  average_speed_mps numeric(10, 4),
  average_pace_seconds_per_km numeric(10, 3),
  average_heart_rate smallint,
  maximum_heart_rate smallint,
  average_cadence numeric(8, 2),
  elevation_gain_m numeric(12, 2),
  elevation_loss_m numeric(12, 2),
  calories integer,
  training_effect jsonb not null default '{}'::jsonb,
  laps jsonb not null default '[]'::jsonb,
  normalised_data jsonb not null default '{}'::jsonb,
  match_state text not null default 'unmatched',
  match_confidence numeric(5, 4),
  matched_at timestamptz,
  source text not null,
  source_activity_id text,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_records_owner_key unique (id, athlete_id),
  constraint activity_records_account_owner_fk
    foreign key (integration_account_id, athlete_id)
    references public.integration_accounts (id, athlete_id)
    on delete no action
    deferrable initially deferred,
  constraint activity_records_session_owner_fk
    foreign key (session_id, athlete_id)
    references public.sessions (id, athlete_id)
    on delete no action
    deferrable initially deferred,
  constraint activity_records_log_session_owner_fk
    foreign key (session_log_id, session_id, athlete_id)
    references public.session_logs (id, session_id, athlete_id)
    on delete no action
    deferrable initially deferred,
  constraint activity_records_log_requires_session
    check (session_log_id is null or session_id is not null),
  constraint activity_records_type_not_blank
    check (btrim(activity_type) <> ''),
  constraint activity_records_title_not_blank
    check (title is null or btrim(title) <> ''),
  constraint activity_records_duration_valid
    check (duration_seconds is null or duration_seconds >= 0),
  constraint activity_records_distance_valid
    check (distance_m is null or distance_m >= 0),
  constraint activity_records_speed_valid
    check (average_speed_mps is null or average_speed_mps >= 0),
  constraint activity_records_pace_valid
    check (
      average_pace_seconds_per_km is null
      or average_pace_seconds_per_km >= 0
    ),
  constraint activity_records_average_hr_valid
    check (average_heart_rate is null or average_heart_rate > 0),
  constraint activity_records_max_hr_valid
    check (maximum_heart_rate is null or maximum_heart_rate > 0),
  constraint activity_records_cadence_valid
    check (average_cadence is null or average_cadence >= 0),
  constraint activity_records_elevation_gain_valid
    check (elevation_gain_m is null or elevation_gain_m >= 0),
  constraint activity_records_elevation_loss_valid
    check (elevation_loss_m is null or elevation_loss_m >= 0),
  constraint activity_records_calories_valid
    check (calories is null or calories >= 0),
  constraint activity_records_training_effect_is_object
    check (jsonb_typeof(training_effect) = 'object'),
  constraint activity_records_laps_is_array
    check (jsonb_typeof(laps) = 'array'),
  constraint activity_records_normalised_is_object
    check (jsonb_typeof(normalised_data) = 'object'),
  constraint activity_records_match_state_valid
    check (match_state in ('unmatched', 'candidate', 'matched', 'ignored')),
  constraint activity_records_match_confidence_valid
    check (match_confidence is null or match_confidence between 0 and 1),
  constraint activity_records_source_not_blank
    check (btrim(source) <> ''),
  constraint activity_records_source_id_not_blank
    check (source_activity_id is null or btrim(source_activity_id) <> ''),
  constraint activity_records_legacy_id_not_blank
    check (legacy_id is null or btrim(legacy_id) <> '')
);

create table public.garmin_activities (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  integration_account_id uuid,
  activity_record_id uuid,
  garmin_activity_id text not null,
  garmin_workout_id text,
  garmin_activity_type text,
  processing_state text not null default 'received',
  raw_payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  imported_at timestamptz not null default now(),
  last_processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint garmin_activities_owner_key unique (id, athlete_id),
  constraint garmin_activities_external_key unique (athlete_id, garmin_activity_id),
  constraint garmin_activities_record_key unique (activity_record_id),
  constraint garmin_activities_account_owner_fk
    foreign key (integration_account_id, athlete_id)
    references public.integration_accounts (id, athlete_id)
    on delete no action
    deferrable initially deferred,
  constraint garmin_activities_record_owner_fk
    foreign key (activity_record_id, athlete_id)
    references public.activity_records (id, athlete_id)
    on delete no action
    deferrable initially deferred,
  constraint garmin_activities_id_not_blank
    check (btrim(garmin_activity_id) <> ''),
  constraint garmin_activities_workout_id_not_blank
    check (garmin_workout_id is null or btrim(garmin_workout_id) <> ''),
  constraint garmin_activities_state_valid
    check (
      processing_state in (
        'received',
        'normalised',
        'candidate',
        'matched',
        'ignored',
        'error'
      )
    ),
  constraint garmin_activities_raw_is_object
    check (jsonb_typeof(raw_payload) = 'object')
);

create table public.daily_recovery (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  integration_account_id uuid,
  recovery_date date not null,
  resting_heart_rate smallint,
  hrv_ms numeric(8, 2),
  hrv_weekly_average_ms numeric(8, 2),
  hrv_status text,
  sleep_duration_seconds integer,
  deep_sleep_seconds integer,
  rem_sleep_seconds integer,
  sleep_score numeric(5, 2),
  average_stress_level numeric(5, 2),
  body_battery_current numeric(6, 2),
  body_battery_high numeric(6, 2),
  body_battery_low numeric(6, 2),
  garmin_training_readiness numeric(5, 2),
  garmin_training_readiness_level text,
  garmin_training_readiness_feedback text,
  garmin_training_status text,
  acute_training_load numeric(12, 2),
  vo2_max numeric(6, 2),
  race_predictions jsonb not null default '{}'::jsonb,
  endurance_score numeric(10, 2),
  hill_score numeric(10, 2),
  subjective_readiness numeric(3, 1),
  subjective_soreness numeric(3, 1),
  trainvault_readiness numeric(5, 2),
  readiness_state text not null default 'unknown',
  recommended_variant text,
  contributing_factors jsonb not null default '[]'::jsonb,
  is_partial boolean not null default false,
  unavailable_metrics text[] not null default '{}'::text[],
  source_data jsonb not null default '{}'::jsonb,
  source_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_recovery_owner_key unique (id, athlete_id),
  constraint daily_recovery_date_key unique (athlete_id, recovery_date),
  constraint daily_recovery_account_owner_fk
    foreign key (integration_account_id, athlete_id)
    references public.integration_accounts (id, athlete_id)
    on delete no action
    deferrable initially deferred,
  constraint daily_recovery_resting_hr_valid
    check (resting_heart_rate is null or resting_heart_rate > 0),
  constraint daily_recovery_hrv_valid
    check (hrv_ms is null or hrv_ms >= 0),
  constraint daily_recovery_hrv_weekly_average_valid
    check (hrv_weekly_average_ms is null or hrv_weekly_average_ms >= 0),
  constraint daily_recovery_sleep_duration_valid
    check (sleep_duration_seconds is null or sleep_duration_seconds >= 0),
  constraint daily_recovery_deep_sleep_valid
    check (deep_sleep_seconds is null or deep_sleep_seconds >= 0),
  constraint daily_recovery_rem_sleep_valid
    check (rem_sleep_seconds is null or rem_sleep_seconds >= 0),
  constraint daily_recovery_sleep_score_valid
    check (sleep_score is null or sleep_score between 0 and 100),
  constraint daily_recovery_stress_level_valid
    check (average_stress_level is null or average_stress_level between 0 and 100),
  constraint daily_recovery_body_battery_current_valid
    check (body_battery_current is null or body_battery_current between 0 and 100),
  constraint daily_recovery_body_battery_high_valid
    check (body_battery_high is null or body_battery_high between 0 and 100),
  constraint daily_recovery_body_battery_low_valid
    check (body_battery_low is null or body_battery_low between 0 and 100),
  constraint daily_recovery_garmin_readiness_valid
    check (
      garmin_training_readiness is null
      or garmin_training_readiness between 0 and 100
    ),
  constraint daily_recovery_load_valid
    check (acute_training_load is null or acute_training_load >= 0),
  constraint daily_recovery_vo2_max_valid
    check (vo2_max is null or vo2_max >= 0),
  constraint daily_recovery_race_predictions_is_object
    check (jsonb_typeof(race_predictions) = 'object'),
  constraint daily_recovery_endurance_score_valid
    check (endurance_score is null or endurance_score >= 0),
  constraint daily_recovery_hill_score_valid
    check (hill_score is null or hill_score >= 0),
  constraint daily_recovery_subjective_readiness_valid
    check (subjective_readiness is null or subjective_readiness between 0 and 10),
  constraint daily_recovery_subjective_soreness_valid
    check (subjective_soreness is null or subjective_soreness between 0 and 10),
  constraint daily_recovery_trainvault_readiness_valid
    check (trainvault_readiness is null or trainvault_readiness between 0 and 100),
  constraint daily_recovery_state_valid
    check (readiness_state in ('green', 'amber', 'red', 'unknown')),
  constraint daily_recovery_variant_valid
    check (
      recommended_variant is null
      or recommended_variant in ('full', 'adjusted', 'minimum', 'rest')
    ),
  constraint daily_recovery_factors_is_array
    check (jsonb_typeof(contributing_factors) = 'array'),
  constraint daily_recovery_source_is_object
    check (jsonb_typeof(source_data) = 'object')
);

create table public.training_metrics (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  metric_date date not null,
  period_start date,
  period_end date,
  scope text not null,
  metric_name text not null,
  numeric_value numeric,
  text_value text,
  unit text,
  dimensions jsonb not null default '{}'::jsonb,
  source_data jsonb not null default '{}'::jsonb,
  data_points_count integer not null default 0,
  confidence numeric(5, 4),
  calculation_version text,
  source text not null default 'trainvault',
  source_id text,
  legacy_id text,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_metrics_owner_key unique (id, athlete_id),
  constraint training_metrics_period_valid
    check (period_end is null or period_start is null or period_end >= period_start),
  constraint training_metrics_scope_valid
    check (scope in ('daily', 'weekly', 'rolling_7d', 'rolling_28d', 'plan', 'event', 'custom')),
  constraint training_metrics_name_not_blank
    check (btrim(metric_name) <> ''),
  constraint training_metrics_has_value
    check (numeric_value is not null or text_value is not null),
  constraint training_metrics_dimensions_is_object
    check (jsonb_typeof(dimensions) = 'object'),
  constraint training_metrics_source_data_is_object
    check (jsonb_typeof(source_data) = 'object'),
  constraint training_metrics_data_points_valid
    check (data_points_count >= 0),
  constraint training_metrics_confidence_valid
    check (confidence is null or confidence between 0 and 1),
  constraint training_metrics_source_not_blank
    check (btrim(source) <> ''),
  constraint training_metrics_source_id_not_blank
    check (source_id is null or btrim(source_id) <> ''),
  constraint training_metrics_legacy_id_not_blank
    check (legacy_id is null or btrim(legacy_id) <> '')
);

create table public.coach_decisions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  session_id uuid,
  recovery_id uuid,
  decision_type text not null,
  status text not null default 'proposed',
  recommended_variant text,
  input_snapshot jsonb not null default '{}'::jsonb,
  original_state jsonb not null default '{}'::jsonb,
  proposed_changes jsonb not null default '{}'::jsonb,
  applied_changes jsonb,
  rationale text not null,
  contributing_factors jsonb not null default '[]'::jsonb,
  generated_by text not null default 'rules',
  deterministic_rule_version text,
  model_metadata jsonb not null default '{}'::jsonb,
  requires_confirmation boolean not null default true,
  responded_at timestamptz,
  applied_at timestamptz,
  source text not null default 'trainvault',
  source_id text,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_decisions_owner_key unique (id, athlete_id),
  constraint coach_decisions_session_owner_fk
    foreign key (session_id, athlete_id)
    references public.sessions (id, athlete_id)
    on delete no action
    deferrable initially deferred,
  constraint coach_decisions_recovery_owner_fk
    foreign key (recovery_id, athlete_id)
    references public.daily_recovery (id, athlete_id)
    on delete no action
    deferrable initially deferred,
  constraint coach_decisions_type_not_blank
    check (btrim(decision_type) <> ''),
  constraint coach_decisions_status_valid
    check (
      status in (
        'proposed',
        'accepted',
        'rejected',
        'applied',
        'expired',
        'superseded'
      )
    ),
  constraint coach_decisions_variant_valid
    check (
      recommended_variant is null
      or recommended_variant in ('full', 'adjusted', 'minimum', 'rest', 'custom')
    ),
  constraint coach_decisions_input_is_object
    check (jsonb_typeof(input_snapshot) = 'object'),
  constraint coach_decisions_original_is_object
    check (jsonb_typeof(original_state) = 'object'),
  constraint coach_decisions_proposed_is_object
    check (jsonb_typeof(proposed_changes) = 'object'),
  constraint coach_decisions_applied_is_object
    check (applied_changes is null or jsonb_typeof(applied_changes) = 'object'),
  constraint coach_decisions_rationale_not_blank
    check (btrim(rationale) <> ''),
  constraint coach_decisions_factors_is_array
    check (jsonb_typeof(contributing_factors) = 'array'),
  constraint coach_decisions_generated_by_valid
    check (generated_by in ('rules', 'openai', 'athlete', 'coach', 'system')),
  constraint coach_decisions_model_metadata_is_object
    check (jsonb_typeof(model_metadata) = 'object'),
  constraint coach_decisions_source_not_blank
    check (btrim(source) <> ''),
  constraint coach_decisions_source_id_not_blank
    check (source_id is null or btrim(source_id) <> ''),
  constraint coach_decisions_legacy_id_not_blank
    check (legacy_id is null or btrim(legacy_id) <> '')
);

create table public.coach_insights (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  decision_id uuid,
  session_id uuid,
  event_id uuid,
  category text not null,
  title text not null,
  body text not null,
  evidence jsonb not null default '[]'::jsonb,
  confidence numeric(5, 4),
  sample_size integer,
  generated_by text not null default 'rules',
  model_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  available_from timestamptz not null default now(),
  expires_at timestamptz,
  source text not null default 'trainvault',
  source_id text,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_insights_owner_key unique (id, athlete_id),
  constraint coach_insights_decision_owner_fk
    foreign key (decision_id, athlete_id)
    references public.coach_decisions (id, athlete_id)
    on delete no action
    deferrable initially deferred,
  constraint coach_insights_session_owner_fk
    foreign key (session_id, athlete_id)
    references public.sessions (id, athlete_id)
    on delete no action
    deferrable initially deferred,
  constraint coach_insights_event_owner_fk
    foreign key (event_id, athlete_id)
    references public.events (id, athlete_id)
    on delete no action
    deferrable initially deferred,
  constraint coach_insights_category_not_blank
    check (btrim(category) <> ''),
  constraint coach_insights_title_not_blank
    check (btrim(title) <> ''),
  constraint coach_insights_body_not_blank
    check (btrim(body) <> ''),
  constraint coach_insights_evidence_is_array
    check (jsonb_typeof(evidence) = 'array'),
  constraint coach_insights_confidence_valid
    check (confidence is null or confidence between 0 and 1),
  constraint coach_insights_sample_size_valid
    check (sample_size is null or sample_size >= 0),
  constraint coach_insights_generated_by_valid
    check (generated_by in ('rules', 'openai', 'athlete', 'coach', 'system')),
  constraint coach_insights_model_metadata_is_object
    check (jsonb_typeof(model_metadata) = 'object'),
  constraint coach_insights_status_valid
    check (status in ('active', 'dismissed', 'archived', 'expired')),
  constraint coach_insights_expiry_valid
    check (expires_at is null or expires_at >= available_from),
  constraint coach_insights_source_not_blank
    check (btrim(source) <> ''),
  constraint coach_insights_source_id_not_blank
    check (source_id is null or btrim(source_id) <> ''),
  constraint coach_insights_legacy_id_not_blank
    check (legacy_id is null or btrim(legacy_id) <> '')
);

create table public.data_migrations (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  migration_key text not null,
  source_kind text not null,
  source_version text,
  source_fingerprint text,
  status text not null default 'pending',
  records_discovered integer not null default 0,
  records_imported integer not null default 0,
  records_skipped integer not null default 0,
  records_failed integer not null default 0,
  checkpoint jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  failure_details jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_migrations_owner_key unique (id, athlete_id),
  constraint data_migrations_key unique (athlete_id, migration_key),
  constraint data_migrations_migration_key_not_blank
    check (btrim(migration_key) <> ''),
  constraint data_migrations_source_kind_not_blank
    check (btrim(source_kind) <> ''),
  constraint data_migrations_status_valid
    check (status in ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  constraint data_migrations_records_discovered_valid
    check (records_discovered >= 0),
  constraint data_migrations_records_imported_valid
    check (records_imported >= 0),
  constraint data_migrations_records_skipped_valid
    check (records_skipped >= 0),
  constraint data_migrations_records_failed_valid
    check (records_failed >= 0),
  constraint data_migrations_checkpoint_is_object
    check (jsonb_typeof(checkpoint) = 'object'),
  constraint data_migrations_summary_is_object
    check (jsonb_typeof(summary) = 'object'),
  constraint data_migrations_failures_is_array
    check (jsonb_typeof(failure_details) = 'array'),
  constraint data_migrations_times_valid
    check (completed_at is null or started_at is null or completed_at >= started_at)
);

-- Ownership, relationship, source-deduplication, and timeline indexes.
create index training_goals_athlete_status_date_idx
  on public.training_goals (athlete_id, status, target_date);
create unique index training_goals_source_id_key
  on public.training_goals (athlete_id, source, source_id)
  where source_id is not null;
create unique index training_goals_legacy_id_key
  on public.training_goals (athlete_id, legacy_id)
  where legacy_id is not null;

create index events_athlete_date_idx
  on public.events (athlete_id, starts_on);
create index events_goal_id_idx
  on public.events (goal_id)
  where goal_id is not null;
create unique index events_source_id_key
  on public.events (athlete_id, source, source_id)
  where source_id is not null;
create unique index events_legacy_id_key
  on public.events (athlete_id, legacy_id)
  where legacy_id is not null;

create index training_plans_athlete_status_date_idx
  on public.training_plans (athlete_id, status, starts_on);
create index training_plans_goal_id_idx
  on public.training_plans (goal_id)
  where goal_id is not null;
create index training_plans_event_id_idx
  on public.training_plans (event_id)
  where event_id is not null;
create unique index training_plans_source_id_key
  on public.training_plans (athlete_id, source, source_id)
  where source_id is not null;
create unique index training_plans_legacy_id_key
  on public.training_plans (athlete_id, legacy_id)
  where legacy_id is not null;

create index sessions_athlete_date_status_idx
  on public.sessions (athlete_id, scheduled_on, status);
create index sessions_training_plan_id_idx
  on public.sessions (training_plan_id)
  where training_plan_id is not null;
create index sessions_event_id_idx
  on public.sessions (event_id)
  where event_id is not null;
create index sessions_garmin_state_idx
  on public.sessions (athlete_id, garmin_sync_state)
  where garmin_sync_state <> 'not_sent';
create unique index sessions_garmin_workout_id_key
  on public.sessions (athlete_id, garmin_workout_id)
  where garmin_workout_id is not null;
create unique index sessions_source_id_key
  on public.sessions (athlete_id, source, source_id)
  where source_id is not null;
create unique index sessions_legacy_id_key
  on public.sessions (athlete_id, legacy_id)
  where legacy_id is not null;

create index session_blocks_athlete_session_idx
  on public.session_blocks (athlete_id, session_id, position);
create unique index session_blocks_legacy_id_key
  on public.session_blocks (athlete_id, legacy_id)
  where legacy_id is not null;

create index session_variants_athlete_session_idx
  on public.session_variants (athlete_id, session_id);
create unique index session_variants_recommended_key
  on public.session_variants (session_id)
  where is_recommended;
create unique index session_variants_legacy_id_key
  on public.session_variants (athlete_id, legacy_id)
  where legacy_id is not null;

create index session_logs_athlete_completed_idx
  on public.session_logs (athlete_id, completed_at desc);
create unique index session_logs_source_id_key
  on public.session_logs (athlete_id, source, source_id)
  where source_id is not null;
create unique index session_logs_legacy_id_key
  on public.session_logs (athlete_id, legacy_id)
  where legacy_id is not null;

create index integration_accounts_athlete_status_idx
  on public.integration_accounts (athlete_id, status);

create index activity_records_athlete_started_idx
  on public.activity_records (athlete_id, started_at desc);
create index activity_records_account_id_idx
  on public.activity_records (integration_account_id)
  where integration_account_id is not null;
create index activity_records_session_id_idx
  on public.activity_records (session_id)
  where session_id is not null;
create index activity_records_log_id_idx
  on public.activity_records (session_log_id)
  where session_log_id is not null;
create index activity_records_match_state_idx
  on public.activity_records (athlete_id, match_state, started_at desc);
create unique index activity_records_source_id_key
  on public.activity_records (athlete_id, source, source_activity_id)
  where source_activity_id is not null;
create unique index activity_records_legacy_id_key
  on public.activity_records (athlete_id, legacy_id)
  where legacy_id is not null;

create index garmin_activities_athlete_state_idx
  on public.garmin_activities (athlete_id, processing_state, imported_at desc);
create index garmin_activities_account_id_idx
  on public.garmin_activities (integration_account_id)
  where integration_account_id is not null;
create index garmin_activities_workout_id_idx
  on public.garmin_activities (athlete_id, garmin_workout_id)
  where garmin_workout_id is not null;

create index daily_recovery_account_id_idx
  on public.daily_recovery (integration_account_id)
  where integration_account_id is not null;

create index training_metrics_athlete_metric_date_idx
  on public.training_metrics (athlete_id, metric_name, metric_date desc);
create unique index training_metrics_source_id_key
  on public.training_metrics (athlete_id, source, source_id)
  where source_id is not null;
create unique index training_metrics_legacy_id_key
  on public.training_metrics (athlete_id, legacy_id)
  where legacy_id is not null;

create index coach_decisions_athlete_status_idx
  on public.coach_decisions (athlete_id, status, created_at desc);
create index coach_decisions_session_id_idx
  on public.coach_decisions (session_id)
  where session_id is not null;
create index coach_decisions_recovery_id_idx
  on public.coach_decisions (recovery_id)
  where recovery_id is not null;
create unique index coach_decisions_source_id_key
  on public.coach_decisions (athlete_id, source, source_id)
  where source_id is not null;
create unique index coach_decisions_legacy_id_key
  on public.coach_decisions (athlete_id, legacy_id)
  where legacy_id is not null;

create index coach_insights_athlete_status_idx
  on public.coach_insights (athlete_id, status, available_from desc);
create index coach_insights_decision_id_idx
  on public.coach_insights (decision_id)
  where decision_id is not null;
create index coach_insights_session_id_idx
  on public.coach_insights (session_id)
  where session_id is not null;
create index coach_insights_event_id_idx
  on public.coach_insights (event_id)
  where event_id is not null;
create unique index coach_insights_source_id_key
  on public.coach_insights (athlete_id, source, source_id)
  where source_id is not null;
create unique index coach_insights_legacy_id_key
  on public.coach_insights (athlete_id, legacy_id)
  where legacy_id is not null;

create index data_migrations_athlete_status_idx
  on public.data_migrations (athlete_id, status, created_at desc);

-- Keep updated_at reliable for direct Data API and server-side writes.
create function public.trainvault_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

comment on function public.trainvault_set_updated_at() is
  'Internal trigger helper for TrainVault updated_at columns.';

create trigger athletes_set_updated_at
  before update on public.athletes
  for each row execute function public.trainvault_set_updated_at();
create trigger athlete_settings_set_updated_at
  before update on public.athlete_settings
  for each row execute function public.trainvault_set_updated_at();
create trigger training_goals_set_updated_at
  before update on public.training_goals
  for each row execute function public.trainvault_set_updated_at();
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.trainvault_set_updated_at();
create trigger training_plans_set_updated_at
  before update on public.training_plans
  for each row execute function public.trainvault_set_updated_at();
create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute function public.trainvault_set_updated_at();
create trigger session_blocks_set_updated_at
  before update on public.session_blocks
  for each row execute function public.trainvault_set_updated_at();
create trigger session_variants_set_updated_at
  before update on public.session_variants
  for each row execute function public.trainvault_set_updated_at();
create trigger session_logs_set_updated_at
  before update on public.session_logs
  for each row execute function public.trainvault_set_updated_at();
create trigger integration_accounts_set_updated_at
  before update on public.integration_accounts
  for each row execute function public.trainvault_set_updated_at();
create trigger activity_records_set_updated_at
  before update on public.activity_records
  for each row execute function public.trainvault_set_updated_at();
create trigger garmin_activities_set_updated_at
  before update on public.garmin_activities
  for each row execute function public.trainvault_set_updated_at();
create trigger daily_recovery_set_updated_at
  before update on public.daily_recovery
  for each row execute function public.trainvault_set_updated_at();
create trigger training_metrics_set_updated_at
  before update on public.training_metrics
  for each row execute function public.trainvault_set_updated_at();
create trigger coach_decisions_set_updated_at
  before update on public.coach_decisions
  for each row execute function public.trainvault_set_updated_at();
create trigger coach_insights_set_updated_at
  before update on public.coach_insights
  for each row execute function public.trainvault_set_updated_at();
create trigger data_migrations_set_updated_at
  before update on public.data_migrations
  for each row execute function public.trainvault_set_updated_at();

revoke all privileges on function public.trainvault_set_updated_at()
  from public, anon, authenticated, service_role;

-- Public is an exposed schema. Every TrainVault table is protected by RLS,
-- and no anonymous table privileges are granted.
alter table public.athletes enable row level security;
alter table public.athlete_settings enable row level security;
alter table public.training_goals enable row level security;
alter table public.events enable row level security;
alter table public.training_plans enable row level security;
alter table public.sessions enable row level security;
alter table public.session_blocks enable row level security;
alter table public.session_variants enable row level security;
alter table public.session_logs enable row level security;
alter table public.integration_accounts enable row level security;
alter table public.activity_records enable row level security;
alter table public.garmin_activities enable row level security;
alter table public.daily_recovery enable row level security;
alter table public.training_metrics enable row level security;
alter table public.coach_decisions enable row level security;
alter table public.coach_insights enable row level security;
alter table public.data_migrations enable row level security;

create policy "Athletes manage their own profile"
  on public.athletes
  for all
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Athletes manage their own settings"
  on public.athlete_settings
  for all
  to authenticated
  using ((select auth.uid()) = athlete_id)
  with check ((select auth.uid()) = athlete_id);

create policy "Athletes manage their own training goals"
  on public.training_goals
  for all
  to authenticated
  using ((select auth.uid()) = athlete_id)
  with check ((select auth.uid()) = athlete_id);

create policy "Athletes manage their own events"
  on public.events
  for all
  to authenticated
  using ((select auth.uid()) = athlete_id)
  with check ((select auth.uid()) = athlete_id);

create policy "Athletes manage their own training plans"
  on public.training_plans
  for all
  to authenticated
  using ((select auth.uid()) = athlete_id)
  with check ((select auth.uid()) = athlete_id);

create policy "Athletes manage their own sessions"
  on public.sessions
  for all
  to authenticated
  using ((select auth.uid()) = athlete_id)
  with check ((select auth.uid()) = athlete_id);

create policy "Athletes manage their own session blocks"
  on public.session_blocks
  for all
  to authenticated
  using ((select auth.uid()) = athlete_id)
  with check ((select auth.uid()) = athlete_id);

create policy "Athletes manage their own session variants"
  on public.session_variants
  for all
  to authenticated
  using ((select auth.uid()) = athlete_id)
  with check ((select auth.uid()) = athlete_id);

create policy "Athletes manage their own session logs"
  on public.session_logs
  for all
  to authenticated
  using ((select auth.uid()) = athlete_id)
  with check ((select auth.uid()) = athlete_id);

create policy "Athletes manage their own integration accounts"
  on public.integration_accounts
  for all
  to authenticated
  using ((select auth.uid()) = athlete_id)
  with check ((select auth.uid()) = athlete_id);

create policy "Athletes manage their own activity records"
  on public.activity_records
  for all
  to authenticated
  using ((select auth.uid()) = athlete_id)
  with check ((select auth.uid()) = athlete_id);

create policy "Athletes manage their own Garmin activities"
  on public.garmin_activities
  for all
  to authenticated
  using ((select auth.uid()) = athlete_id)
  with check ((select auth.uid()) = athlete_id);

create policy "Athletes manage their own daily recovery"
  on public.daily_recovery
  for all
  to authenticated
  using ((select auth.uid()) = athlete_id)
  with check ((select auth.uid()) = athlete_id);

create policy "Athletes manage their own training metrics"
  on public.training_metrics
  for all
  to authenticated
  using ((select auth.uid()) = athlete_id)
  with check ((select auth.uid()) = athlete_id);

create policy "Athletes manage their own coach decisions"
  on public.coach_decisions
  for all
  to authenticated
  using ((select auth.uid()) = athlete_id)
  with check ((select auth.uid()) = athlete_id);

create policy "Athletes manage their own coach insights"
  on public.coach_insights
  for all
  to authenticated
  using ((select auth.uid()) = athlete_id)
  with check ((select auth.uid()) = athlete_id);

create policy "Athletes manage their own data migrations"
  on public.data_migrations
  for all
  to authenticated
  using ((select auth.uid()) = athlete_id)
  with check ((select auth.uid()) = athlete_id);

revoke all privileges on table
  public.athletes,
  public.athlete_settings,
  public.training_goals,
  public.events,
  public.training_plans,
  public.sessions,
  public.session_blocks,
  public.session_variants,
  public.session_logs,
  public.integration_accounts,
  public.activity_records,
  public.garmin_activities,
  public.daily_recovery,
  public.training_metrics,
  public.coach_decisions,
  public.coach_insights,
  public.data_migrations
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.athletes,
  public.athlete_settings,
  public.training_goals,
  public.events,
  public.training_plans,
  public.sessions,
  public.session_blocks,
  public.session_variants,
  public.session_logs,
  public.integration_accounts,
  public.activity_records,
  public.garmin_activities,
  public.daily_recovery,
  public.training_metrics,
  public.coach_decisions,
  public.coach_insights,
  public.data_migrations
to authenticated, service_role;
