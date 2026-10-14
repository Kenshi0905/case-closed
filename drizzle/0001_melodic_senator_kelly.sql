CREATE TABLE `case_ai_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`result_text` text,
	`model` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`leased_until` integer,
	`lease_token` text
);
--> statement-breakpoint
CREATE TABLE `case_ai_status` (
	`id` text PRIMARY KEY NOT NULL,
	`last_heartbeat` integer NOT NULL,
	`model` text DEFAULT 'Local model' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `case_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`hits` integer NOT NULL
);
