import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import type { Enrichment, Ingredient, Step } from "@/lib/recipe-types";

export const EMBEDDING_DIMENSIONS = 768;

export type UserStatus = "pending" | "approved" | "declined";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  passwordHash: text("password_hash").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  // New sign-ups wait for the owner's approval.
  status: text("status").$type<UserStatus>().notNull().default("pending"),
  requestNote: text("request_note"),
  // Bumped on password change / revoke: old session cookies stop working.
  sessionVersion: integer("session_version").notNull().default(0),
  telegramChatId: bigint("telegram_chat_id", { mode: "number" }).unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SourceKind = "url" | "image" | "audio" | "text";

// The raw thing someone sent in. Kept forever so the Source view can show it.
export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").$type<SourceKind>().notNull(),
  url: text("url"),
  files: jsonb("files").$type<{ url: string; mediaType: string }[]>().notNull().default([]),
  text: text("text"),
  status: text("status").$type<"pending" | "done" | "failed">().notNull().default("pending"),
  error: text("error"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    titleEnglish: text("title_english").notNull(),
    description: text("description"),
    language: text("language").notNull().default("en"),
    author: text("author"),
    servings: text("servings"),
    prepMinutes: integer("prep_minutes"),
    cookMinutes: integer("cook_minutes"),
    totalMinutes: integer("total_minutes"),
    ingredients: jsonb("ingredients").$type<Ingredient[]>().notNull(),
    steps: jsonb("steps").$type<Step[]>().notNull(),
    enrichment: jsonb("enrichment").$type<Enrichment>(),
    cuisine: text("cuisine").notNull(),
    course: text("course").notNull(),
    diet: text("diet").array().notNull().default([]),
    season: text("season").notNull(),
    tags: text("tags").array().notNull().default([]),
    notes: text("notes"),
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    shareToken: text("share_token").notNull().unique(),
    sourceId: uuid("source_id").references(() => sources.id),
    // Set on a fresh import that looks like an existing recipe, until someone decides.
    duplicateOf: uuid("duplicate_of"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recipes_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops"))],
);

// Canonical ingredients + join table: the "graph" behind "what can I make with X".
export const ingredients = pgTable("ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
});

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    optional: boolean("optional").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.recipeId, t.ingredientId] }),
    index("recipe_ingredients_ingredient_idx").on(t.ingredientId),
  ],
);

export type User = typeof users.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type Source = typeof sources.$inferSelect;

// Telegram sends each photo of an album as its own update. We park them here
// briefly so one handler can import the whole album as a single recipe.
export const pendingMedia = pgTable(
  "pending_media",
  {
    groupId: text("group_id").notNull(),
    messageId: bigint("message_id", { mode: "number" }).notNull(),
    chatId: bigint("chat_id", { mode: "number" }).notNull(),
    fileId: text("file_id").notNull(),
    mediaType: text("media_type").notNull(),
    caption: text("caption"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.messageId] })],
);

// Fixed-window counters for login/registration throttling (per IP and per username).
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

// Cached LLM substitution advice, keyed by ingredient (+ recipe for in-context swaps).
export const substitutions = pgTable("substitutions", {
  key: text("key").primaryKey(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
