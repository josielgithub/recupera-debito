CREATE TABLE `impersonacao_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`admin_id` int NOT NULL,
	`usuario_visualizado_id` int NOT NULL,
	`token` varchar(64) NOT NULL,
	`iniciado_em` timestamp NOT NULL DEFAULT (now()),
	`expirado_em` timestamp NOT NULL,
	`encerrado_em` timestamp,
	`ativo` boolean NOT NULL DEFAULT true,
	CONSTRAINT `impersonacao_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `impersonacao_log_token_unique` UNIQUE(`token`)
);
