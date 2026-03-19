# TCX Runner — Customer Onboarding Requirements

This document lists everything your organisation needs to provide or prepare before TCX Runner can go live. Share it with your IT team and include it with your offer letter.

---

## 1. Microsoft Entra ID (Azure AD)

TCX Runner uses Microsoft Entra ID for single sign-on (SSO). Your IT team will need to complete a one-time setup.

### Required from your IT team

| Item | Description | Where to find it |
|---|---|---|
| **Entra Tenant ID** | Your organisation's Microsoft 365 tenant ID (a UUID) | Azure Portal → Entra ID → Overview |
| **Runners Security Group** | An Entra security group called "Runners" (or similar) containing all employees who will use TCX Runner | Azure Portal → Entra ID → Groups |
| **Runners Security Group ID** | The Object ID of the security group above | Azure Portal → Groups → select the group → Overview |

### What your IT team needs to do

1. Create the "Runners" security group in Entra and add the relevant employees.
2. Register TCX Runner as a **multi-tenant SPA** application in Azure App Registrations — the TCX Hub team will provide the exact configuration details.
3. Provide the **Tenant ID** and **Security Group ID** to your TCX Runner account manager.

> No persistent application permissions are required. TCX Runner only reads group membership at login time to verify the user is in the Runners group.

---

## 2. 3CX PBX

TCX Runner connects to your 3CX system via the xAPI. Your 3CX administrator will need to provide credentials.

### Option A — xAPI Credentials (recommended)

| Item | Description |
|---|---|
| **PBX FQDN** | The web address of your 3CX system, e.g. `pbx.yourcompany.com:5001` |
| **xAPI Client ID** | Generated in the 3CX Management Console under API |
| **xAPI Client Secret** | Generated alongside the Client ID |

### Option B — Admin credentials

If xAPI credentials are not available, a standard 3CX admin username and password can be used as a fallback.

### PBX checklist

- [ ] 3CX version 18 or higher
- [ ] xAPI enabled in the 3CX Management Console
- [ ] Departments (Groups) configured for the runners to switch between
- [ ] Ring groups set up and associated with departments (if ring group automation is required)
- [ ] Extensions created for all runners

---

## 3. Runner employees

For each employee who will use TCX Runner, your HR or IT team should provide:

| Item | Description |
|---|---|
| **Work email address** | Used for Microsoft SSO login |
| **3CX extension number** | The extension they will switch from |
| **Allowed departments** | Which departments they are permitted to switch between |
| **Default caller ID** | (Optional) Outbound caller ID to apply on switches |

> Runners can be bulk-imported via the Admin Portal once the PBX is connected. TCX Runner pulls the user list directly from the PBX.

---

## 4. Network / Firewall

TCX Runner communicates with your PBX over HTTPS (port 443 or your custom PBX port). Ensure the following:

- [ ] The PBX is reachable from the internet (or a VPN if applicable) on the xAPI port
- [ ] HTTPS is enabled on the 3CX web interface
- [ ] No firewall rules block outbound HTTPS requests from the PBX to `runner-api.tcx-hub.com`

---

## 5. Devices (for Intune-managed deployments)

If you want zero-tap silent SSO for runners on managed Android devices:

- [ ] Devices enrolled in Microsoft Intune
- [ ] Microsoft Authenticator installed and configured
- [ ] Company Portal app installed
- [ ] The TCX Runner PWA (`runner.tcx-hub.com`) added as a managed web app in Intune

> For non-Intune deployments, runners log in manually with their Microsoft account or email/password. No device management required.

---

## 6. Summary checklist for your offer letter

| # | Requirement | Responsible |
|---|---|---|
| 1 | Entra Tenant ID | IT team |
| 2 | Entra "Runners" security group created + group ID | IT team |
| 3 | Entra multi-tenant app registration completed | IT team + TCX Hub |
| 4 | 3CX PBX FQDN | 3CX administrator |
| 5 | xAPI Client ID + Client Secret | 3CX administrator |
| 6 | Departments configured in 3CX | 3CX administrator |
| 7 | Runner employee list (email + extension + departments) | HR / Line manager |
| 8 | Network access confirmed (HTTPS to PBX) | IT team |
| 9 | Intune configuration (if applicable) | IT team |

---

*TCX Hub handles all platform setup, hosting, and maintenance. Customer IT involvement is limited to the items above — typically a one-time 2–4 hour setup.*
