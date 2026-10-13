import { relations } from "drizzle-orm";
import { auditLogs } from "./audit";
import { authorizationAttestations } from "./attestations";
import { consents } from "./consents";
import { mfaFactors, recoveryCodes } from "./mfa";
import { personaMemberships, personas } from "./personas";
import { plans, subscriptions } from "./plans";
import { sessions } from "./sessions";
import { documents } from "./documents";
import { processingJobs } from "./processing-jobs";
import {
  sourceMessages,
  sourceParticipants,
  sourceThreads,
} from "./chat-sources";
import {
  sourceFiles,
  sourceFileVersions,
  sourceImports,
} from "./sources";
import { users } from "./users";

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  mfaFactors: many(mfaFactors),
  recoveryCodes: many(recoveryCodes),
  subscription: one(subscriptions, {
    fields: [users.id],
    references: [subscriptions.userId],
  }),
  memberships: many(personaMemberships),
  createdPersonas: many(personas),
  auditLogs: many(auditLogs),
  consents: many(consents),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id],
  }),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const personasRelations = relations(personas, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [personas.createdByUserId],
    references: [users.id],
  }),
  memberships: many(personaMemberships),
  consents: many(consents),
  attestations: many(authorizationAttestations),
  sourceImports: many(sourceImports),
  sourceFiles: many(sourceFiles),
  documents: many(documents),
  sourceParticipants: many(sourceParticipants),
  sourceThreads: many(sourceThreads),
  sourceMessages: many(sourceMessages),
}));

export const authorizationAttestationsRelations = relations(
  authorizationAttestations,
  ({ one }) => ({
    persona: one(personas, {
      fields: [authorizationAttestations.personaId],
      references: [personas.id],
    }),
  }),
);

export const personaMembershipsRelations = relations(
  personaMemberships,
  ({ one }) => ({
    persona: one(personas, {
      fields: [personaMemberships.personaId],
      references: [personas.id],
    }),
    user: one(users, {
      fields: [personaMemberships.userId],
      references: [users.id],
    }),
  }),
);

export const consentsRelations = relations(consents, ({ one }) => ({
  persona: one(personas, {
    fields: [consents.personaId],
    references: [personas.id],
  }),
  user: one(users, {
    fields: [consents.userId],
    references: [users.id],
  }),
}));

export const mfaFactorsRelations = relations(mfaFactors, ({ one }) => ({
  user: one(users, {
    fields: [mfaFactors.userId],
    references: [users.id],
  }),
}));

export const recoveryCodesRelations = relations(recoveryCodes, ({ one }) => ({
  user: one(users, {
    fields: [recoveryCodes.userId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [auditLogs.actorUserId],
    references: [users.id],
  }),
}));

export const sourceImportsRelations = relations(
  sourceImports,
  ({ one, many }) => ({
    persona: one(personas, {
      fields: [sourceImports.personaId],
      references: [personas.id],
    }),
    createdBy: one(users, {
      fields: [sourceImports.createdByUserId],
      references: [users.id],
    }),
    files: many(sourceFiles),
  }),
);

export const sourceFilesRelations = relations(sourceFiles, ({ one, many }) => ({
  persona: one(personas, {
    fields: [sourceFiles.personaId],
    references: [personas.id],
  }),
  import: one(sourceImports, {
    fields: [sourceFiles.importId],
    references: [sourceImports.id],
  }),
  uploadedBy: one(users, {
    fields: [sourceFiles.uploadedByUserId],
    references: [users.id],
  }),
  versions: many(sourceFileVersions),
  participants: many(sourceParticipants),
  thread: one(sourceThreads, {
    fields: [sourceFiles.id],
    references: [sourceThreads.fileId],
  }),
}));

export const sourceParticipantsRelations = relations(
  sourceParticipants,
  ({ one, many }) => ({
    persona: one(personas, {
      fields: [sourceParticipants.personaId],
      references: [personas.id],
    }),
    file: one(sourceFiles, {
      fields: [sourceParticipants.fileId],
      references: [sourceFiles.id],
    }),
    messages: many(sourceMessages),
  }),
);

export const sourceThreadsRelations = relations(
  sourceThreads,
  ({ one, many }) => ({
    persona: one(personas, {
      fields: [sourceThreads.personaId],
      references: [personas.id],
    }),
    file: one(sourceFiles, {
      fields: [sourceThreads.fileId],
      references: [sourceFiles.id],
    }),
    messages: many(sourceMessages),
  }),
);

export const sourceMessagesRelations = relations(sourceMessages, ({ one }) => ({
  persona: one(personas, {
    fields: [sourceMessages.personaId],
    references: [personas.id],
  }),
  thread: one(sourceThreads, {
    fields: [sourceMessages.threadId],
    references: [sourceThreads.id],
  }),
  participant: one(sourceParticipants, {
    fields: [sourceMessages.participantId],
    references: [sourceParticipants.id],
  }),
}));

export const sourceFileVersionsRelations = relations(
  sourceFileVersions,
  ({ one, many }) => ({
    file: one(sourceFiles, {
      fields: [sourceFileVersions.fileId],
      references: [sourceFiles.id],
    }),
    processingJobs: many(processingJobs),
    document: one(documents, {
      fields: [sourceFileVersions.id],
      references: [documents.fileVersionId],
    }),
  }),
);

export const documentsRelations = relations(documents, ({ one }) => ({
  persona: one(personas, {
    fields: [documents.personaId],
    references: [personas.id],
  }),
  fileVersion: one(sourceFileVersions, {
    fields: [documents.fileVersionId],
    references: [sourceFileVersions.id],
  }),
}));

export const processingJobsRelations = relations(processingJobs, ({ one }) => ({
  persona: one(personas, {
    fields: [processingJobs.personaId],
    references: [personas.id],
  }),
  fileVersion: one(sourceFileVersions, {
    fields: [processingJobs.fileVersionId],
    references: [sourceFileVersions.id],
  }),
}));
