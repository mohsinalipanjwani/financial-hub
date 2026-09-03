-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'FINANCE', 'MANAGEMENT', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'PARTIAL');

-- CreateEnum
CREATE TYPE "RevenueStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'INVOICED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('PENDING', 'CLEARED', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "DataQualitySeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "DataQualityStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "client_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT,
    "lead" TEXT,
    "account_manager" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMP(3),
    "notes" TEXT,
    "source_system" TEXT NOT NULL DEFAULT 'seed',
    "source_sheet" TEXT,
    "source_row" INTEGER,
    "last_synced_at" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue" (
    "id" TEXT NOT NULL,
    "revenue_key" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "project" TEXT,
    "phase" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "RevenueStatus" NOT NULL DEFAULT 'CONFIRMED',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "received_date" TIMESTAMP(3),
    "expected_date" TIMESTAMP(3),
    "payment_method" TEXT,
    "lead" TEXT,
    "developer" TEXT,
    "notes" TEXT,
    "client_id" TEXT NOT NULL,
    "source_system" TEXT NOT NULL DEFAULT 'seed',
    "source_sheet" TEXT,
    "source_row" INTEGER,
    "last_synced_at" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "payment_key" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" TEXT,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'CLEARED',
    "notes" TEXT,
    "client_id" TEXT NOT NULL,
    "revenue_id" TEXT,
    "source_system" TEXT NOT NULL DEFAULT 'seed',
    "source_sheet" TEXT,
    "source_row" INTEGER,
    "last_synced_at" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "employee_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "source_system" TEXT NOT NULL DEFAULT 'seed',
    "source_sheet" TEXT,
    "source_row" INTEGER,
    "last_synced_at" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_costs" (
    "id" TEXT NOT NULL,
    "cost_key" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "salary" DECIMAL(14,2) NOT NULL,
    "overhead" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "team_member_id" TEXT NOT NULL,
    "source_system" TEXT NOT NULL DEFAULT 'seed',
    "source_sheet" TEXT,
    "source_row" INTEGER,
    "last_synced_at" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "subscription_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT,
    "category" TEXT,
    "monthly_cost" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "start_date" TIMESTAMP(3),
    "renewal_date" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "source_system" TEXT NOT NULL DEFAULT 'seed',
    "source_sheet" TEXT,
    "source_row" INTEGER,
    "last_synced_at" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "expense_key" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "source_system" TEXT NOT NULL DEFAULT 'seed',
    "source_sheet" TEXT,
    "source_row" INTEGER,
    "last_synced_at" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "rate_to_usd" DECIMAL(18,8) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "rows_read" INTEGER NOT NULL DEFAULT 0,
    "rows_created" INTEGER NOT NULL DEFAULT 0,
    "rows_updated" INTEGER NOT NULL DEFAULT 0,
    "rows_rejected" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_quality_issues" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_key" TEXT,
    "code" TEXT NOT NULL,
    "severity" "DataQualitySeverity" NOT NULL DEFAULT 'WARNING',
    "status" "DataQualityStatus" NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "source_sheet" TEXT,
    "source_row" INTEGER,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "data_quality_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metadata" JSONB,
    "user_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clients_client_key_key" ON "clients"("client_key");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_revenue_key_key" ON "revenue"("revenue_key");

-- CreateIndex
CREATE INDEX "revenue_month_idx" ON "revenue"("month");

-- CreateIndex
CREATE INDEX "revenue_client_id_idx" ON "revenue"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_key_key" ON "payments"("payment_key");

-- CreateIndex
CREATE INDEX "payments_date_idx" ON "payments"("date");

-- CreateIndex
CREATE INDEX "payments_client_id_idx" ON "payments"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_employee_key_key" ON "team_members"("employee_key");

-- CreateIndex
CREATE UNIQUE INDEX "team_costs_cost_key_key" ON "team_costs"("cost_key");

-- CreateIndex
CREATE INDEX "team_costs_month_idx" ON "team_costs"("month");

-- CreateIndex
CREATE INDEX "team_costs_team_member_id_idx" ON "team_costs"("team_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_subscription_key_key" ON "subscriptions"("subscription_key");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_expense_key_key" ON "expenses"("expense_key");

-- CreateIndex
CREATE INDEX "expenses_month_idx" ON "expenses"("month");

-- CreateIndex
CREATE INDEX "exchange_rates_currency_idx" ON "exchange_rates"("currency");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_currency_date_key" ON "exchange_rates"("currency", "date");

-- CreateIndex
CREATE INDEX "data_quality_issues_status_idx" ON "data_quality_issues"("status");

-- CreateIndex
CREATE INDEX "data_quality_issues_entity_type_idx" ON "data_quality_issues"("entity_type");

-- AddForeignKey
ALTER TABLE "revenue" ADD CONSTRAINT "revenue_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_revenue_id_fkey" FOREIGN KEY ("revenue_id") REFERENCES "revenue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_costs" ADD CONSTRAINT "team_costs_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
