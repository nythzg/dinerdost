"use client";
import { MemberEditor } from "./member-editor";
import { Badge, DataTable, Icon } from "@/components/ui";
import { date, money, type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
import { InviteLink, StaffAccessEditor, roleName } from "./team-access";
export function Team() {
  const { data, form, run, modal, close, notify } = useDesk();
  const editMember = (member: Row) =>
    modal("Edit member", <MemberEditor member={member} />);
  const invite = () =>
    modal(
      "Invite staff",
      <StaffAccessEditor
        outlets={data.outlets}
        outletId={data.outletId}
        save={async (input) => {
          const result = await run("staffInvite", input);
          modal(
            "Invite link",
            <InviteLink
              url={window.location.origin + "/invite/" + result.token}
            />,
          );
        }}
      />,
    );
  const editAccess = (member: Row) =>
    modal(
      "Edit access · " + member.name,
      <StaffAccessEditor
        member={member}
        outlets={data.outlets}
        outletId={data.outletId}
        save={async (input) => {
          await run("employeeRole", input, { id: member.id });
          close();
          notify("Access updated.");
        }}
      />,
    );
  const add = () => modal("Add team member", <MemberEditor />);
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <h2>Team access</h2>
          <div className="inline-actions">
            <button className="button" onClick={add}>
              <Icon name="plus" />
              Add member
            </button>
            <button className="button primary" onClick={invite}>
              <Icon name="plus" />
              Invite staff
            </button>
          </div>
        </div>
        <DataTable
          headers={["Name", "Role", "Outlets", "Monthly salary", "Access", ""]}
          rows={(data.employees ?? []).map((e: Row) => [
            <strong>{e.name}</strong>,
            <Badge value={e.role === "KITCHEN" ? "CHEF" : e.role} />,
            e.outlet_ids
              .map(
                (id: string) =>
                  data.outlets.find((o: Row) => o.id === id)?.name ??
                  "Unassigned",
              )
              .join(", "),
            money(e.base_salary),
            <Badge value={e.active ? "ACTIVE" : "REVOKED"} />,
            <div className="inline-actions">
              <button className="button small" onClick={() => editMember(e)}>
                Edit member
              </button>
              {e.role !== "OWNER" && (
                <>
                  <button
                    className="button small"
                    onClick={() => editAccess(e)}
                  >
                    Edit access
                  </button>
                  <button
                    className="button small"
                    onClick={() =>
                      form(
                        e.active ? "Revoke access" : "Restore access",
                        [
                          {
                            name: "password",
                            label: "Confirm your password",
                            type: "password",
                          },
                        ],
                        (v) =>
                          run(
                            "employeeAccess",
                            { active: !e.active, password: v.password },
                            { id: e.id },
                          ),
                        e.active ? "Revoke" : "Restore",
                      )
                    }
                  >
                    {e.active ? "Revoke" : "Restore"}
                  </button>
                </>
              )}
            </div>,
          ])}
        />
      </section>
      {data.staffInvitations?.length > 0 && (
        <section className="panel" style={{ marginTop: 24 }}>
          <div className="panel-heading">
            <h2>Invites</h2>
          </div>
          <DataTable
            headers={["Name", "Email", "Role", "Expires", ""]}
            rows={data.staffInvitations.map((invitation: Row) => [
              invitation.name,
              invitation.email,
              roleName(invitation.role),
              date(invitation.expires_at),
              <button
                className="button small"
                onClick={() =>
                  void run("revokeStaffInvite", undefined, {
                    id: invitation.id,
                  }).catch(() => {})
                }
              >
                Revoke invite
              </button>,
            ])}
          />
        </section>
      )}
    </>
  );
}
