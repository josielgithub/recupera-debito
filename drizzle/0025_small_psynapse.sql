CREATE TABLE `processo_sentenca_dados` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processo_id` int NOT NULL,
	`processo_autos_id` int NOT NULL,
	`tipo` enum('sentenca','alvara') NOT NULL,
	`resultado` enum('procedente','improcedente','parcialmente_procedente','nao_identificado'),
	`cabe_recurso` boolean,
	`valor_sentenca` decimal(15,2),
	`data_sentenca` timestamp,
	`valor_alvara` decimal(15,2),
	`data_deposito_alvara` timestamp,
	`texto_extraido` text,
	`confianca` enum('alta','media','baixa') NOT NULL DEFAULT 'media',
	`extraido_em` timestamp NOT NULL DEFAULT (now()),
	`modelo_usado` varchar(128),
	CONSTRAINT `processo_sentenca_dados_id` PRIMARY KEY(`id`)
);
