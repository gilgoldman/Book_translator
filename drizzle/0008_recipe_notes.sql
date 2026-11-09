CREATE TABLE "recipe_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"user_id" uuid,
	"text" text DEFAULT '' NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_notes" ADD CONSTRAINT "recipe_notes_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_notes" ADD CONSTRAINT "recipe_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_notes_recipe_idx" ON "recipe_notes" USING btree ("recipe_id","created_at");--> statement-breakpoint
-- Each recipe's old single notes box becomes its first note. Who wrote it isn't known; the
-- recipe's uploader is the best guess.
INSERT INTO "recipe_notes" ("recipe_id", "user_id", "text", "created_at")
SELECT "id", "created_by", "notes", "updated_at" FROM "recipes" WHERE coalesce(trim("notes"), '') <> '';
