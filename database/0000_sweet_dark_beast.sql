CREATE TABLE `extraProperties` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text,
	`name` text,
	`dateAdded` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fileExtraProperties` (
	`textValue` text,
	`numberValue` real,
	`extraProperties` text NOT NULL,
	`file` text,
	PRIMARY KEY(`extraProperties`, `file`),
	FOREIGN KEY (`extraProperties`) REFERENCES `extraProperties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fileExtraProperties_file_idx` ON `fileExtraProperties` (`file`);--> statement-breakpoint
CREATE TABLE `fileSearchCriterias` (
	`criteria` text,
	`fileSearch` text,
	FOREIGN KEY (`fileSearch`) REFERENCES `fileSearch`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `fileSearch` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`matchAny` integer,
	`indexVal` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fileTags` (
	`tag` text,
	`file` text,
	PRIMARY KEY(`tag`, `file`),
	FOREIGN KEY (`tag`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fileTags_file_idx` ON `fileTags` (`file`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`ino` text NOT NULL,
	`locationId` text,
	`relativePath` text NOT NULL,
	`absolutePath` text NOT NULL,
	`dateAdded` integer NOT NULL,
	`dateModified` integer NOT NULL,
	`origDateModified` integer NOT NULL,
	`dateLastIndexed` integer NOT NULL,
	`dateCreated` integer NOT NULL,
	`name` text NOT NULL,
	`extension` text NOT NULL,
	`size` real NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	FOREIGN KEY (`locationId`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_absolutePath_unique` ON `files` (`absolutePath`);--> statement-breakpoint
CREATE TABLE `impliedTags` (
	`id` integer PRIMARY KEY NOT NULL,
	`impliedTag` text NOT NULL,
	`tag` text NOT NULL,
	FOREIGN KEY (`impliedTag`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `locationTags` (
	`tag` text,
	`location` text,
	PRIMARY KEY(`tag`, `location`),
	FOREIGN KEY (`tag`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`dateAdded` integer NOT NULL,
	`indexVal` integer NOT NULL,
	`isWatchingFiles` integer
);
--> statement-breakpoint
CREATE TABLE `subLocationTags` (
	`tag` text,
	`subLocation` text,
	PRIMARY KEY(`tag`, `subLocation`),
	FOREIGN KEY (`tag`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subLocation`) REFERENCES `subLocations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `subLocations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`rootLocation` text,
	`isExcluded` integer,
	`parentLocation` text,
	FOREIGN KEY (`rootLocation`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parentLocation`) REFERENCES `subLocations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `subTags` (
	`subTag` text PRIMARY KEY NOT NULL,
	`tag` text NOT NULL,
	FOREIGN KEY (`subTag`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tagAliases` (
	`id` integer PRIMARY KEY NOT NULL,
	`alias` text,
	`tag` text NOT NULL,
	FOREIGN KEY (`tag`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`dateAdded` integer NOT NULL,
	`color` text,
	`isHidden` integer,
	`isVisibleInherited` integer,
	`isHeader` integer,
	`description` text
);
