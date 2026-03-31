CREATE TABLE `import_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome_arquivo` varchar(255),
	`total_linhas` int NOT NULL DEFAULT 0,
	`linhas_importadas` int NOT NULL DEFAULT 0,
	`linhas_erro` int NOT NULL DEFAULT 0,
	`linhas_conciliadas` int NOT NULL DEFAULT 0,
	`linhas_nao_encontradas` int NOT NULL DEFAULT 0,
	`status` enum('importando','conciliando','concluido','erro') NOT NULL DEFAULT 'importando',
	`detalhes` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `import_jobs_id` PRIMARY KEY(`id`)
);
