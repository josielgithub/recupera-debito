CREATE TABLE `manus_llm_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processo_cnj` varchar(30) NOT NULL,
	`solicitado_por` int NOT NULL,
	`solicitado_em` timestamp NOT NULL DEFAULT (now()),
	`tokens_entrada` int,
	`tokens_saida` int,
	`custo_estimado` decimal(10,6),
	`modelo` varchar(128),
	`sucesso` boolean NOT NULL DEFAULT true,
	CONSTRAINT `manus_llm_log_id` PRIMARY KEY(`id`)
);
