CREATE TABLE `wardrobe_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`gender` text DEFAULT 'unspecified' NOT NULL
);
