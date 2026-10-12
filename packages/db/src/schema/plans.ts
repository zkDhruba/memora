import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { PlanId, PlanLimits } from "@memora/shared";
import { subscriptionStatusEnum } from "./enums";
import { users } from "./users";

export const plans = pgTable("plans", {
  id: text("id").$type<PlanId>().primaryKey(),
  displayName: text("display_name").notNull(),
  limits: jsonb("limits").$type<PlanLimits>().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .$type<PlanId>()
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatusEnum("status").notNull().default("active"),
    overrideMaxPersonas: integer("override_max_personas"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("subscriptions_plan_id_idx").on(t.planId)],
);
