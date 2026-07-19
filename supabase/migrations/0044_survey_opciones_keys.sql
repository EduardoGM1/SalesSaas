-- Convierte opciones del banco Discovery de texto ES a claves estables
update public.survey_preguntas
set opciones = '["rest_disconnect","family_time","couple_reconnect","create_memories","health_wellness","new_destinations","live_adventures","celebrate_moments","comfort_service","escape_routine"]'::jsonb, updated_at = now()
where clave = 'p1';

update public.survey_preguntas
set opciones = '["calm","freedom","joy","family_connection","couple_connection","fun","adventure","renewal","pampered","safety"]'::jsonb, updated_at = now()
where clave = 'p2';

update public.survey_preguntas
set opciones = '["lodging_quality","good_location","space_privacy","good_service","activities_all","date_flexibility","easy_booking","destination_variety","safety","family_comfort","clear_costs","value_for_money"]'::jsonb, updated_at = now()
where clave = 'p3';

update public.survey_preguntas
set opciones = '["travel_more","more_nights","better_quality","more_space","more_destinations","more_family","less_effort","better_dates","cost_control","more_flexibility"]'::jsonb, updated_at = now()
where clave = 'p4';

update public.survey_preguntas
set opciones = '["known","new","both"]'::jsonb, updated_at = now()
where clave = 'style1';

update public.survey_preguntas
set opciones = '["well_ahead","months_ahead","near_date"]'::jsonb, updated_at = now()
where clave = 'style2';

update public.survey_preguntas
set opciones = '["rest","activities","balance"]'::jsonb, updated_at = now()
where clave = 'style3';

update public.survey_preguntas
set opciones = '["practicality","quality_service","cost_experience"]'::jsonb, updated_at = now()
where clave = 'style4';

update public.survey_preguntas
set opciones = '["no_time","work","budget","school_calendar","expensive_flights","no_availability","hard_to_organize","no_right_lodging","not_enough_space","unexpected_costs","hard_to_agree","personal_health","booking_distrust","nothing_important","prefer_not_say"]'::jsonb, updated_at = now()
where clave = 'p21';

update public.survey_preguntas
set opciones = '["travel_less","fewer_nights","overspend","sacrifice_quality","miss_dates","not_enough_space","organizing_takes_time","postpone","uneven_enjoyment","as_planned"]'::jsonb, updated_at = now()
where clave = 'p22';

update public.survey_preguntas
set opciones = '["pay_unused","no_availability","rising_costs","extra_fees","no_flexibility","too_long","dont_understand","rushed_decision","travel_style_change","not_enough_trust","no_specific_worry","prefer_not_say"]'::jsonb, updated_at = now()
where clave = 'p23';

update public.survey_preguntas
set opciones = '["person_present","decide_together","one_proposes_numbers","one_organizes_confirms","someone_absent","depends_trip"]'::jsonb, updated_at = now()
where clave = 'p24';

update public.survey_preguntas
set opciones = '["clear_how","review_numbers","compare_options","real_examples","read_terms","confirm_availability","ask_someone","time_to_think","trust_explainer","everyone_agrees"]'::jsonb, updated_at = now()
where clave = 'p25';

update public.survey_preguntas
set opciones = '["very_positive","positive","neutral","some_doubts","negative","very_negative","no_opinion"]'::jsonb, updated_at = now()
where clave = 't1';

update public.survey_preguntas
set opciones = '["own_experience","family_friends","prior_presentation","current_prior_membership","internet_info","costs_fees","availability","positive_stories","little_knowledge","other"]'::jsonb, updated_at = now()
where clave = 't2';

update public.survey_preguntas
set opciones = '["never","once","several","dont_remember"]'::jsonb, updated_at = now()
where clave = 't3';

update public.survey_preguntas
set opciones = '["only_learned","considered_no_buy","bought","bought_canceled","unclear_memory","not_applicable"]'::jsonb, updated_at = now()
where clave = 't4';

update public.survey_preguntas
set opciones = '["not_the_moment","price","down_payment","monthly","fees","didnt_understand","not_enough_value","no_flexibility","availability_doubts","lack_of_trust","wanted_to_research","felt_pressured","already_had_product","missing_decision_maker","other","not_applicable"]'::jsonb, updated_at = now()
where clave = 't5';

update public.survey_preguntas
set opciones = '["never_had","have_one","have_more","had_before","bought_canceled","inheritance","not_sure"]'::jsonb, updated_at = now()
where clave = 't6';

update public.survey_preguntas
set opciones = '["travel_more","secure_future","better_quality","more_space","family_memories","more_destinations","hedge_prices","use_exchanges","presentation_convinced","special_benefits","other","not_applicable"]'::jsonb, updated_at = now()
where clave = 't7';

update public.survey_preguntas
set opciones = '["yes_fully","mostly","partially","does_not","not_sure","not_applicable"]'::jsonb, updated_at = now()
where clave = 't8';

update public.survey_preguntas
set opciones = '["use_satisfied","satisfied_little_use","hard_availability","dont_know_use","costs_rose","lose_points","not_fit_family","not_fit_travel","want_change","prefer_not_say","not_applicable"]'::jsonb, updated_at = now()
where clave = 't9';

update public.survey_preguntas
set opciones = '["dont_use","no_availability","book_too_early","few_destinations","not_enough_points","wrong_season","not_enough_space","high_fees","high_monthly","hard_exchange","exchange_costs","poor_service","family_changed","travel_changed","no_major_issue","other","not_applicable"]'::jsonb, updated_at = now()
where clave = 't10';

update public.survey_preguntas
set opciones = '["keep_as_is","learn_better","more_capacity","complement","upgrade","consolidate","sell_or_leave","not_sure_yet","not_applicable"]'::jsonb, updated_at = now()
where clave = 't11';

update public.survey_preguntas
set opciones = '["yes","no","had_before","not_sure"]'::jsonb, updated_at = now()
where clave = 'hasTs';
