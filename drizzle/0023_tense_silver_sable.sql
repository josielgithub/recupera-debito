ALTER TABLE `judit_consulta_log` MODIFY COLUMN `tipo` enum('consulta_avulsa','importacao','consulta_lote','download_autos') NOT NULL DEFAULT 'consulta_avulsa';--> statement-breakpoint
ALTER TABLE `processo_autos` ADD `instancia` int DEFAULT 1;--> statement-breakpoint
ALTER TABLE `processo_autos` ADD `status_anexo` varchar(32) DEFAULT 'done';--> statement-breakpoint
ALTER TABLE `processo_autos` ADD `corrompido` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `processo_autos` ADD `step_id` varchar(64);