CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adminId` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`entityType` varchar(50) NOT NULL,
	`entityId` int,
	`oldValue` json,
	`newValue` json,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `driver_queues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`driverId` int NOT NULL,
	`zoneId` varchar(50) NOT NULL,
	`position` int NOT NULL,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `driver_queues_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `drivers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`licenseNumber` varchar(50) NOT NULL,
	`licenseExpiry` timestamp NOT NULL,
	`taxiLicense` varchar(50) NOT NULL,
	`taxiLicenseExpiry` timestamp NOT NULL,
	`rating` decimal(3,2) DEFAULT '5.00',
	`totalTrips` int DEFAULT 0,
	`isVerified` boolean DEFAULT false,
	`status` enum('available','busy','offline') NOT NULL DEFAULT 'offline',
	`currentLatitude` decimal(10,8),
	`currentLongitude` decimal(11,8),
	`lastLocationUpdate` timestamp,
	`currentZoneId` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drivers_id` PRIMARY KEY(`id`),
	CONSTRAINT `drivers_licenseNumber_unique` UNIQUE(`licenseNumber`),
	CONSTRAINT `drivers_taxiLicense_unique` UNIQUE(`taxiLicense`)
);
--> statement-breakpoint
CREATE TABLE `passengers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`homeAddress` text,
	`workAddress` text,
	`favoriteLocations` json,
	`totalRides` int DEFAULT 0,
	`averageRating` decimal(3,2) DEFAULT '5.00',
	`preferredPaymentMethod` enum('cash','card','wallet') DEFAULT 'cash',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `passengers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `queue_zones` (
	`id` varchar(50) NOT NULL,
	`name` text NOT NULL,
	`centerLatitude` decimal(10,8) NOT NULL,
	`centerLongitude` decimal(11,8) NOT NULL,
	`radiusMeters` int NOT NULL DEFAULT 500,
	`city` varchar(100) NOT NULL,
	`country` varchar(100) NOT NULL DEFAULT 'Spain',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `queue_zones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rideId` int NOT NULL,
	`ratedById` int NOT NULL,
	`ratedUserId` int NOT NULL,
	`score` int NOT NULL,
	`comment` text,
	`categories` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ratings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`passengerId` int NOT NULL,
	`driverId` int,
	`taxiId` int,
	`pickupLatitude` decimal(10,8) NOT NULL,
	`pickupLongitude` decimal(11,8) NOT NULL,
	`pickupAddress` text,
	`dropoffLatitude` decimal(10,8) NOT NULL,
	`dropoffLongitude` decimal(11,8) NOT NULL,
	`dropoffAddress` text,
	`status` enum('pending','accepted','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
	`estimatedFare` decimal(10,2),
	`actualFare` decimal(10,2),
	`estimatedDuration` int,
	`actualDuration` int,
	`distance` decimal(10,2),
	`paymentMethod` enum('cash','card','wallet') DEFAULT 'cash',
	`isPaid` boolean DEFAULT false,
	`cancelledBy` enum('passenger','driver'),
	`cancellationReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`acceptedAt` timestamp,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rides_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `taxis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`driverId` int NOT NULL,
	`licensePlate` varchar(20) NOT NULL,
	`make` varchar(50) NOT NULL,
	`model` varchar(50) NOT NULL,
	`year` int NOT NULL,
	`color` varchar(30),
	`capacity` int NOT NULL DEFAULT 4,
	`insuranceExpiry` timestamp,
	`inspectionExpiry` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `taxis_id` PRIMARY KEY(`id`),
	CONSTRAINT `taxis_licensePlate_unique` UNIQUE(`licensePlate`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('passenger','driver','admin') NOT NULL DEFAULT 'passenger';--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `language` enum('es','ca','en') DEFAULT 'es' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `profilePicture` text;--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;