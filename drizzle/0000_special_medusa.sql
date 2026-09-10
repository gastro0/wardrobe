CREATE TABLE `outfits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`item_ids` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_outfits_user` ON `outfits` (`user_id`);--> statement-breakpoint
CREATE TABLE `wardrobe_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`city` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wardrobe_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`color` text NOT NULL,
	`min_temp` integer NOT NULL,
	`max_temp` integer NOT NULL,
	`rainproof` integer DEFAULT 0 NOT NULL,
	`windproof` integer DEFAULT 0 NOT NULL,
	`image_key` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_wardrobe_items_user` ON `wardrobe_items` (`user_id`);