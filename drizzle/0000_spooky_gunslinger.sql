CREATE TABLE `case_events` (
	`id` text PRIMARY KEY NOT NULL,
	`state_json` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `case_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `case_showcases` (
	`id` text PRIMARY KEY NOT NULL,
	`state_json` text NOT NULL,
	`created_at` integer NOT NULL
);
