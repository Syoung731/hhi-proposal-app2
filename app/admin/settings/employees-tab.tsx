"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createEmployee,
  toggleEmployeeActive,
  toggleEmployeeAdmin,
  deleteEmployee,
} from "./actions";
import type { EmployeeForUI } from "./settings-tabs";
import { SUPER_ADMIN_EMAIL } from "@/app/lib/constants";
import { EmployeeEditDrawer } from "./EmployeeEditDrawer";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

type Props = { employees: EmployeeForUI[]; currentUserIsAdmin: boolean };

export function EmployeesTab({ employees: initialEmployees, currentUserIsAdmin }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newEmp, setNewEmp] = useState({
    firstName: "",
    lastName: "",
    roleTitle: "",
    email: "",
    phone: "",
  });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeForUI | null>(
    null,
  );

  const sorted = [...initialEmployees].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.lastName.localeCompare(b.lastName)
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setErrorMessage(null);
    const result = await createEmployee({
      firstName: newEmp.firstName.trim(),
      lastName: newEmp.lastName.trim(),
      roleTitle: newEmp.roleTitle.trim() || null,
      email: newEmp.email.trim() || null,
      phone: newEmp.phone.trim() || null,
    });
    if (result.error) {
      setStatus("error");
      setErrorMessage(result.error);
      return;
    }
    setStatus("saved");
    setAdding(false);
    setNewEmp({ firstName: "", lastName: "", roleTitle: "", email: "", phone: "" });
    router.refresh();
    setTimeout(() => setStatus("idle"), 3000);
  }

  async function handleToggleActive(id: string, _current: boolean) {
    await toggleEmployeeActive(id);
    router.refresh();
  }

  async function handleToggleAdmin(id: string, current: boolean) {
    setErrorMessage(null);
    const result = await toggleEmployeeAdmin(id, !current);
    if (result.error) {
      setErrorMessage(result.error);
      setStatus("error");
    }
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Permanently remove this employee from the directory?")) return;
    await deleteEmployee(id);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
        Employees
      </h2>

      {adding ? (
        <form
          onSubmit={handleAdd}
          className="flex flex-wrap items-end gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50"
        >
          <div>
            <label htmlFor="newFirstName" className={labelClass}>
              First name
            </label>
            <input
              id="newFirstName"
              type="text"
              value={newEmp.firstName}
              onChange={(e) => setNewEmp((p) => ({ ...p, firstName: e.target.value }))}
              className={inputClass}
              placeholder="Jane"
              required
            />
          </div>
          <div>
            <label htmlFor="newLastName" className={labelClass}>
              Last name
            </label>
            <input
              id="newLastName"
              type="text"
              value={newEmp.lastName}
              onChange={(e) => setNewEmp((p) => ({ ...p, lastName: e.target.value }))}
              className={inputClass}
              placeholder="Smith"
              required
            />
          </div>
          <div>
            <label htmlFor="newRoleTitle" className={labelClass}>
              Role
            </label>
            <input
              id="newRoleTitle"
              type="text"
              value={newEmp.roleTitle}
              onChange={(e) => setNewEmp((p) => ({ ...p, roleTitle: e.target.value }))}
              className={inputClass}
              placeholder="e.g. Project Director"
            />
          </div>
          <div>
            <label htmlFor="newEmail" className={labelClass}>
              Email
            </label>
            <input
              id="newEmail"
              type="email"
              value={newEmp.email}
              onChange={(e) => setNewEmp((p) => ({ ...p, email: e.target.value }))}
              className={inputClass}
              placeholder="jane@example.com"
            />
          </div>
          <div>
            <label htmlFor="newPhone" className={labelClass}>
              Phone
            </label>
            <input
              id="newPhone"
              type="tel"
              value={newEmp.phone}
              onChange={(e) => setNewEmp((p) => ({ ...p, phone: e.target.value }))}
              className={inputClass}
              placeholder="(555) 123-4567"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={status === "saving"}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setNewEmp({ firstName: "", lastName: "", roleTitle: "", email: "", phone: "" });
              }}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Add employee
        </button>
      )}

      {(status === "saved" || status === "error") && (
        <div className="flex items-center gap-2">
          {status === "saved" && (
            <span className="text-sm text-green-600 dark:text-green-400">
              Saved successfully.
            </span>
          )}
          {status === "error" && errorMessage && (
            <span className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </span>
          )}
        </div>
      )}

      <div className="w-full overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        {/* Desktop: header row */}
        <div className="hidden lg:grid grid-cols-12 gap-4 px-6 py-3 text-xs font-medium uppercase tracking-wide text-zinc-500 border-b border-zinc-200 dark:text-zinc-400 dark:border-zinc-700">
          <span className="col-span-3">Name</span>
          <span className="col-span-2">Title</span>
          <span className="col-span-3">Email</span>
          <span className="col-span-2">Phone</span>
          <span className="col-span-1 text-center">Active</span>
          <span className="col-span-1 text-center">Admin</span>
          <span className="col-span-1">Actions</span>
        </div>

        {sorted.map((emp) => {
          const isSuperAdmin =
            (emp.email ?? "").toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
          const email = emp.email ?? "";
          const activeBadgeClass = emp.isActive
            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
            : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400";

          return (
            <div
              key={emp.id}
              className="border-b border-zinc-200 last:border-0 dark:border-zinc-700"
            >
              {/* Desktop row (lg+) */}
              <div className="hidden lg:grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                {/* Name */}
                <div className="col-span-3 flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-100 min-w-0">
                  <Avatar employee={emp} />
                  <span className="truncate">
                    {`${emp.firstName} ${emp.lastName}`.trim() || "—"}
                  </span>
                </div>
                {/* Title */}
                <div className="col-span-2 text-zinc-600 dark:text-zinc-400 whitespace-nowrap min-w-0">
                  {emp.roleTitle ?? "—"}
                </div>
                {/* Email */}
                <div className="col-span-3 min-w-0">
                  <span className="block truncate" title={email || undefined}>
                    {email || "—"}
                  </span>
                </div>
                {/* Phone */}
                <div className="col-span-2 text-zinc-600 dark:text-zinc-400 whitespace-nowrap min-w-0">
                  {emp.phone ?? "—"}
                </div>
                {/* Active */}
                <div className="col-span-1 flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(emp.id, emp.isActive)}
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap " +
                      activeBadgeClass
                    }
                  >
                    {emp.isActive ? "Yes" : "No"}
                  </button>
                </div>
                {/* Admin */}
                <div className="col-span-1 flex flex-col items-center justify-center gap-0.5">
                  <input
                    type="checkbox"
                    checked={isSuperAdmin || emp.isAdmin}
                    disabled={!currentUserIsAdmin || isSuperAdmin}
                    onChange={() => handleToggleAdmin(emp.id, emp.isAdmin)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  {isSuperAdmin && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      Super Admin
                    </span>
                  )}
                </div>
                {/* Actions */}
                <div className="col-span-1 inline-flex gap-3 flex-nowrap">
                  <button
                    type="button"
                    onClick={() => setEditingEmployee(emp)}
                    className="hover:underline whitespace-nowrap"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(emp.id)}
                    className="text-red-600 hover:underline dark:text-red-400 whitespace-nowrap"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Mobile/tablet: stacked row (<lg) */}
              <div className="lg:hidden px-6 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-100">
                    <Avatar employee={emp} />
                    <span>{`${emp.firstName} ${emp.lastName}`.trim() || "—"}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(emp.id, emp.isActive)}
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " + activeBadgeClass
                    }
                  >
                    {emp.isActive ? "Active" : "Inactive"}
                  </button>
                </div>
                <div className="mt-1 text-zinc-600 dark:text-zinc-400">
                  {emp.roleTitle ?? "—"}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-zinc-600 dark:text-zinc-400">
                  <span className="truncate" title={email || undefined}>
                    {email || "—"}
                  </span>
                  <span>{emp.phone ?? "—"}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={isSuperAdmin || emp.isAdmin}
                      disabled={!currentUserIsAdmin || isSuperAdmin}
                      onChange={() => handleToggleAdmin(emp.id, emp.isAdmin)}
                      className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    <span className="text-xs">
                      {isSuperAdmin ? "Super Admin" : "Admin"}
                    </span>
                  </label>
                  <div className="inline-flex gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingEmployee(emp)}
                      className="hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(emp.id)}
                      className="text-red-600 hover:underline dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editingEmployee && (
        <EmployeeEditDrawer
          employee={editingEmployee}
          currentUserIsAdmin={currentUserIsAdmin}
          onClose={() => setEditingEmployee(null)}
          onSaved={() => {
            setEditingEmployee(null);
            setStatus("saved");
            router.refresh();
            setTimeout(() => setStatus("idle"), 3000);
          }}
        />
      )}
    </div>
  );
}

/**
 * Round 32px avatar for the list row. Shows the employee's headshot if
 * present, otherwise falls back to initials on a zinc background.
 */
function Avatar({ employee }: { employee: EmployeeForUI }) {
  const initials = `${(employee.firstName[0] ?? "").toUpperCase()}${(employee.lastName[0] ?? "").toUpperCase()}`;
  if (employee.headshotUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={employee.headshotUrl}
        alt=""
        className="h-8 w-8 shrink-0 rounded-full border border-zinc-200 object-cover dark:border-zinc-700"
      />
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
      {initials || "?"}
    </span>
  );
}
