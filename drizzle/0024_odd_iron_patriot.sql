ALTER TABLE `processo_autos` MODIFY COLUMN `url_s3` varchar(1024);--> statement-breakpoint
ALTER TABLE `processo_autos` MODIFY COLUMN `file_key` varchar(1024);--> statement-breakpoint
ALTER TABLE `processo_autos` ADD `download_erro` varchar(256);