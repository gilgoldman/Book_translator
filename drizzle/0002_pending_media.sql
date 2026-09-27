CREATE TABLE "pending_media" (
	"group_id" text NOT NULL,
	"message_id" bigint NOT NULL,
	"chat_id" bigint NOT NULL,
	"file_id" text NOT NULL,
	"media_type" text NOT NULL,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_media_group_id_message_id_pk" PRIMARY KEY("group_id","message_id")
);
