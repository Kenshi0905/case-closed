import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const events = sqliteTable('case_events', { id: text('id').primaryKey(), stateJson: text('state_json').notNull(), revision: integer('revision').notNull().default(0), updatedAt: integer('updated_at').notNull() });
export const sessions = sqliteTable('case_sessions', { tokenHash: text('token_hash').primaryKey(), eventId: text('event_id').notNull(), participantId: text('participant_id').notNull(), expiresAt: integer('expires_at').notNull() });
export const showcases = sqliteTable('case_showcases', { id: text('id').primaryKey(), stateJson: text('state_json').notNull(), createdAt: integer('created_at').notNull() });

export const aiJobs = sqliteTable('case_ai_jobs', { id:text('id').primaryKey(), payloadJson:text('payload_json').notNull(), resultText:text('result_text'), model:text('model'), status:text('status').notNull(), createdAt:integer('created_at').notNull(), expiresAt:integer('expires_at').notNull(), leasedUntil:integer('leased_until'), leaseToken:text('lease_token') });
export const aiStatus = sqliteTable('case_ai_status', { id:text('id').primaryKey(), lastHeartbeat:integer('last_heartbeat').notNull(), model:text('model').notNull().default('Local model') });
export const rateLimits = sqliteTable('case_rate_limits', { key:text('key').primaryKey(), windowStart:integer('window_start').notNull(), hits:integer('hits').notNull() });
