# TCX Runner — Company Admin Guide

This guide is for company administrators of the TCX Runner platform. TCX Runner lets your employees (runners) switch their own 3CX PBX department and caller ID via a mobile app — without needing access to your 3CX admin console. As a company admin, you control who can switch, which departments they can move between, what caller ID is used, and which ring groups they belong to.

Admin console: **runner.tcx-hub.com/admin**

---

## 1. Getting Started

### Receiving your invite

Your TCX Runner account is created by the platform team. You will receive an email with an invite link. Click the link to register your admin account. If you do not receive the email, check your spam folder or contact your TCX Runner account manager.

### First login

1. Go to **runner.tcx-hub.com/admin** and sign in with the credentials you set during registration.
2. After logging in, you will land on the **Dashboard**, which shows a summary of your runners, recent activity, and any configuration warnings.

### Console tabs at a glance

| Tab | What it's for |
|---|---|
| **Dashboard** | Overview of activity and status |
| **Users** | Manage all users in your company — their roles and access |
| **PBX** | Connect and manage your 3CX PBX systems |
| **Runners** | Configure which employees can switch departments and how |
| **MS-Entra** | Link your Microsoft Entra tenant for SSO |
| **Audit Log** | Review a full history of every department switch |

---

## 2. Connecting Your PBX

Before you can add runners, you need to connect at least one PBX. You can connect multiple PBX systems if your company uses more than one.

### Steps

1. Go to the **PBX** tab.
2. Click **Add PBX**.
3. Enter the **FQDN** of your PBX — this is the web address your 3CX system is accessed at, including the port if required (e.g. `pbx.yourcompany.com:5001`).
4. Enter a **Display Name** to identify this PBX in the console (e.g. "Head Office PBX").
5. Choose your **authentication method**:
   - **xAPI (recommended):** Enter the Client ID and Client Secret from your 3CX xAPI credentials. Your 3CX administrator can generate these.
   - **Username / Password:** Enter a 3CX admin username and password if xAPI credentials are not available.
6. Click **Save**. The system will test the connection and, if successful, will import your departments and extensions automatically.

Once connected, your departments and extensions are available for use when configuring runners. If the connection fails, double-check the FQDN and credentials with your 3CX administrator.

---

## 3. Adding Runners

A runner is an employee who is allowed to switch their own department via the mobile app. You control exactly which departments they can switch between and what caller ID is used for each.

### Steps

1. Go to the **Runners** tab.
2. Click **+ Add Runner**.
3. Select the employee from the **PBX user picker** — this pulls a live list of users from your PBX. Selecting a user will automatically fill in their email address, extension number, and default caller ID.
   - If the employee is not in the list, you can fill in their details manually.
4. Under **Departments**, tick the checkboxes for each department this runner is allowed to switch to. You must select at least two.
5. For each selected department, configure the following (expand a department row to see these options):

   **Caller ID**
   - Optionally enter a caller ID that will be applied when this runner switches to this department. This overrides the runner's default caller ID.
   - Leave blank to use the default caller ID instead.

   **Ring Groups**
   - Ring groups linked to this department are shown automatically (pulled from the PBX).
   - A green tick (✓) means the ring group comes from the PBX and will be applied automatically.
   - A blue label means the ring group was added manually by an admin.
   - Click **×** next to any ring group to exclude it for this runner.
   - Click the **+** button to add a ring group that is not listed — for example, a ring group from a different part of the PBX.

6. Set the runner's **Default Caller ID** — this is the caller ID used when switching to any department that does not have its own override.
   - If this is not set, you will see an amber warning. Without a default caller ID, the PBX will keep whatever caller ID was last applied — which may be incorrect after a switch.
7. Click **Save**. The runner will receive a link to the PWA (mobile app) and can begin switching departments straight away.

---

## 4. What Happens When a Runner Switches Department

Understanding the switching process helps you explain it to your team and troubleshoot if something goes wrong.

1. The runner opens the TCX Runner mobile app and taps the department they want to switch to.
2. TCX Runner sends a single instruction to your PBX via the xAPI, which simultaneously:
   - Moves the runner into the new department/group.
   - Applies the correct caller ID for that department (or the default caller ID if no override is set).
   - Removes the runner from the ring groups associated with their previous department.
   - Adds the runner to the ring groups associated with the new department.
3. The switch is completed in under two seconds in most cases.
4. The switch is recorded in the **Audit Log** with the result (success, failed, or denied).

No 3CX admin action is required. The runner handles it themselves.

---

## 5. Ring Groups Explained

Ring groups are a 3CX feature that allows an incoming call to ring multiple extensions at the same time — for example, a "Sales" ring group that rings everyone in the sales team.

TCX Runner manages ring group membership automatically when a runner switches department:

- When a runner switches **into** Department X, they are added to all ring groups associated with Department X.
- When a runner switches **away from** Department X, they are removed from those ring groups.

This means a runner is always in the right ring groups for their current department, without any manual 3CX admin work.

### Customising ring groups per runner

On each runner's configuration, you can adjust which ring groups are applied for a given department:

- **Remove a PBX ring group:** Click **×** next to it. The runner will not be added to that ring group when switching to this department, even if it is the default for the department.
- **Add an extra ring group:** Click the **+** button and select or type in the ring group. This is useful if the runner needs to be in a ring group that is not normally associated with the department.

If you have not customised ring groups for a runner, the PBX defaults for that department are applied automatically.

---

## 6. Managing Users

The **Users** tab shows everyone in your company who has a TCX Runner account.

### What you can see

Each user entry shows their email address, display name, current role, company, and linked PBX.

### Roles

| Role | Access level |
|---|---|
| **Admin** | Full access to all tabs and settings |
| **Manager** | Limited access — cannot change PBX or company settings |
| **Runner** | PWA only — can switch their own department, no console access |

### Changing a user's role

1. Find the user in the list.
2. Click **Edit**.
3. Select **Change Role** and choose the new role.
4. Save.

### Moving a user to a different company

If your organisation has multiple companies set up in TCX Runner and a user needs to move between them:

1. Open the user record.
2. Use the **Move to…** dropdown to select the target company.
3. Save.

---

## 7. Audit Log

The Audit Log records every department switch made by your runners. Use it to verify activity, investigate issues, or satisfy internal compliance requirements.

### What is recorded

Each log entry shows:

- **Runner** — who made the switch
- **From** — the department they switched away from
- **To** — the department they switched into
- **Result** — Success, Failed, or Denied
- **Duration** — how long the switch took
- **Timestamp** — exact date and time

### Filtering

Use the filters at the top of the Audit Log to narrow results:

- **Date range** — show only switches within a specific period
- **Runner** — show only switches by a specific person
- **Status** — show only successes, failures, or denied attempts

### Troubleshooting with the Audit Log

If a runner reports that their switch did not work:

1. Go to the Audit Log and filter by their name.
2. Find the relevant switch attempt.
3. If the result is **Failed**, the switch reached the PBX but was rejected — check that the runner's extension and department configuration in the PBX is correct.
4. If the result is **Denied**, the runner attempted a switch they are not permitted to make — review their runner configuration.

---

## 8. MS-Entra Settings

TCX Runner supports sign-in via Microsoft Entra (formerly Azure Active Directory), allowing your runners to log in with their existing Microsoft work account.

### What you need

- **Entra Tenant ID:** A unique identifier for your Microsoft 365 organisation. Your IT team can provide this.
- **Runners Security Group ID:** The ID of the Entra security group that runners must be a member of to access the PWA.

### Steps to configure

1. Ask your IT team to set up the Entra app registration for TCX Runner and provide you with the Tenant ID and Security Group ID.
2. Go to the **MS-Entra** tab in the admin console.
3. Enter the **Entra Tenant ID** and **Runners Security Group ID**.
4. Click **Save**.

### Important

- Runners must be members of the security group in Entra to access the PWA via SSO. If a runner cannot log in, check their group membership with your IT team.
- The Tenant ID can also be set when a company is first created. If it was left as a placeholder, update it here once your IT team has completed the Entra setup.

---

*For platform-level support, contact your TCX Runner account manager.*
