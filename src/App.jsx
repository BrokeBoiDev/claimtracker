import { useEffect, useMemo, useState } from "react";
import { hasSupabaseConfig, supabase } from "./lib/supabase";

const navItems = [
  ["overview", "Overview"],
  ["repairs", "Repairs"],
  ["customers", "Customers"],
  ["parts", "Parts"],
  ["insurance", "Insurance"],
  ["photos", "Photos"],
  ["pickup", "Pickup"],
  ["updates", "Updates"],
  ["settings", "Settings"]
];

const statuses = [
  "Vehicle Received",
  "Initial Inspection",
  "Estimate Sent",
  "Insurance Review",
  "Parts Ordered",
  "Parts Arrived",
  "Repair In Progress",
  "Paint",
  "Reassembly",
  "Quality Check",
  "Ready for Pickup",
  "Delivered"
];

const photoLabels = ["Check-in damage", "Tear-down", "Parts", "Body work", "Paint", "Finished vehicle"];
const checklistLabels = [
  "Final wash complete",
  "Quality check complete",
  "Customer notified",
  "Deductible collected",
  "Paperwork ready",
  "Keys ready",
  "Review request sent"
];

function getStatusToken() {
  const match = window.location.pathname.match(/^\/status\/([^/]+)/);
  return match?.[1] || new URLSearchParams(window.location.search).get("status");
}

function getInitialView() {
  const viewFromPath = window.location.pathname.replace("/", "");
  return navItems.some(([id]) => id === viewFromPath) ? viewFromPath : "overview";
}

function vehicleName(repair) {
  return [repair.vehicle_year, repair.vehicle_make, repair.vehicle_model].filter(Boolean).join(" ");
}

function applyTemplate(template, repair, shop) {
  const customer = repair.customer || {};
  return (template || "Hi {customer}, this is {shop}. Your {vehicle} is currently at {status}. ETA is {eta}. Current note: {nextUpdate}.")
    .replaceAll("{customer}", customer.name || "there")
    .replaceAll("{shop}", shop?.name || "the shop")
    .replaceAll("{vehicle}", vehicleName(repair) || "vehicle")
    .replaceAll("{status}", repair.status || "in progress")
    .replaceAll("{eta}", repair.estimated_pickup || "not set yet")
    .replaceAll("{nextUpdate}", repair.next_update || "we will send another update when the next step changes");
}

function copyText(text) {
  navigator.clipboard?.writeText(text);
}

export default function App() {
  const statusToken = getStatusToken();

  if (statusToken) {
    return <CustomerStatus token={statusToken} />;
  }

  if (!hasSupabaseConfig) {
    return <ConfigScreen />;
  }

  return <SaasApp />;
}

function SaasApp() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) return <ShellNotice title="Loading ClaimTrack" body="Checking your session." />;
  if (!session) return <AuthScreen />;

  return <ProtectedDashboard session={session} />;
}

function ProtectedDashboard({ session }) {
  const [view, setView] = useState(getInitialView);
  const [collapsed, setCollapsed] = useState(false);
  const [shop, setShop] = useState(null);
  const [data, setData] = useState(emptyData());
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  async function loadShop() {
    setLoading(true);
    await supabase.rpc("accept_pending_invitation_for_current_user");
    const { data: shops, error } = await supabase
      .from("shops")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) {
      showToast(setToast, error.message);
      setLoading(false);
      return;
    }

    const currentShop = shops?.[0] || null;
    setShop(currentShop);
    if (currentShop) await loadData(currentShop.id, setData, setToast);
    setLoading(false);
  }

  useEffect(() => {
    loadShop();
  }, []);

  const metrics = useMemo(() => {
    const repairs = data.repairs;
    return {
      active: repairs.filter((repair) => repair.status !== "Delivered").length,
      insurance: repairs.filter((repair) => repair.status === "Insurance Review").length,
      parts: repairs.filter((repair) => ["Parts Ordered", "Parts Arrived"].includes(repair.status)).length,
      pickup: repairs.filter((repair) => repair.status === "Ready for Pickup").length
    };
  }, [data.repairs]);

  if (loading) return <ShellNotice title="Loading dashboard" body="Pulling shop records from Supabase." />;
  if (!shop) return <Onboarding session={session} onReady={loadShop} />;

  const hasBillingAccess = ["active", "trialing"].includes(shop.subscription_status || "trialing");
  const actions = {
    reload: () => loadData(shop.id, setData, setToast),
    toast: (message) => showToast(setToast, message),
    setView,
    shop,
    data,
    session
  };

  return (
    <div className={collapsed ? "rail-collapsed" : ""}>
      <div className="app">
        <aside className="rail">
          <div className="brand">
            <img className="brand__logo" src="/assets/logo.png" alt="ClaimTrack" />
            <button className="rail-toggle" onClick={() => setCollapsed((value) => !value)} aria-label="Toggle menu">
              <img src="/assets/menu.png" alt="" />
            </button>
          </div>

          <nav className="nav" aria-label="Main navigation">
            {navItems.map(([id, label]) => (
              <button key={id} className={`nav__btn ${view === id ? "active" : ""}`} onClick={() => setView(id)} title={label}>
                <img src={`/assets/${id === "updates" ? "updates" : id}.png`} alt="" />
                {label}
              </button>
            ))}
          </nav>

          <section className="operator-card">
            <p>Shop</p>
            <strong>{shop.name}</strong>
            <span>{shop.phone || "Phone not set"} / {metrics.active} open repairs</span>
          </section>
        </aside>

        <main className="main">
          <header className="topbar">
            <div>
              <p className="kicker">Today's desk</p>
              <h1>{view === "overview" ? "Shop repair board" : pageTitle(view)}</h1>
              <p className="topbar__copy">{shop.name} / {shop.phone || "phone not set"} / {metrics.active} open repairs</p>
            </div>
            <div className="topbar__actions">
              <button className="btn ghost" onClick={() => exportJson(shop, data)}>Export JSON</button>
              <button className="btn primary" onClick={() => setView("repairs")}>Add Repair</button>
            </div>
          </header>

          {!hasBillingAccess && view !== "settings" && <BillingRequired actions={actions} />}
          {hasBillingAccess && view === "overview" && <Overview metrics={metrics} actions={actions} />}
          {hasBillingAccess && view === "repairs" && <Repairs actions={actions} />}
          {hasBillingAccess && view === "customers" && <Customers actions={actions} />}
          {hasBillingAccess && view === "parts" && <Parts actions={actions} />}
          {hasBillingAccess && view === "insurance" && <Insurance actions={actions} />}
          {hasBillingAccess && view === "photos" && <Photos actions={actions} />}
          {hasBillingAccess && view === "pickup" && <Pickup actions={actions} />}
          {hasBillingAccess && view === "updates" && <Updates actions={actions} />}
          {view === "settings" && <Settings actions={actions} />}
        </main>
      </div>
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}

function emptyData() {
  return {
    repairs: [],
    customers: [],
    parts: [],
    insurance_notes: [],
    photo_updates: [],
    pickup_checklists: [],
    review_messages: [],
    settings: null,
    team_invitations: []
  };
}

async function loadData(shopId, setData, setToast) {
  const requests = await Promise.all([
    supabase.from("customers").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }),
    supabase.from("repairs").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }),
    supabase.from("parts").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }),
    supabase.from("insurance_notes").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }),
    supabase.from("photo_updates").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }),
    supabase.from("pickup_checklists").select("*").eq("shop_id", shopId).order("sort_order", { ascending: true }),
    supabase.from("review_messages").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }),
    supabase.from("settings").select("*").eq("shop_id", shopId).maybeSingle(),
    supabase.from("team_invitations").select("*").eq("shop_id", shopId).order("created_at", { ascending: false })
  ]);

  const firstError = requests.find((result) => result.error)?.error;
  if (firstError) {
    showToast(setToast, firstError.message);
    return;
  }

  const [customers, repairs, parts, insurance, photos, checklist, reviews, settings, invites] = requests.map((result) => result.data);
  const withCustomers = repairs.map((repair) => ({
    ...repair,
    customer: customers.find((customer) => customer.id === repair.customer_id)
  }));

  setData({
    repairs: withCustomers,
    customers,
    parts,
    insurance_notes: insurance,
    photo_updates: photos,
    pickup_checklists: checklist,
    review_messages: reviews,
    settings,
    team_invitations: invites
  });
}

function Overview({ metrics, actions }) {
  return (
    <>
      <section className="metrics">
        <Metric label="Active Repairs" number={metrics.active} note="Open repair orders" />
        <Metric label="Waiting on Insurance" number={metrics.insurance} note="Claims needing approval" />
        <Metric label="Waiting on Parts" number={metrics.parts} note="Parts ordered or delayed" />
        <Metric label="Ready for Pickup" number={metrics.pickup} note="Cars ready today" />
      </section>
      <RepairTable repairs={actions.data.repairs} actions={actions} />
      <section className="grid-three">
        <button className="action-card" onClick={() => actions.setView("parts")}>
          <span>Parts</span><strong>{metrics.parts}</strong><h3>Review part delays</h3><span className="btn small">Open Parts</span>
        </button>
        <button className="action-card" onClick={() => actions.setView("insurance")}>
          <span>Insurance</span><strong>{metrics.insurance}</strong><h3>Work claim approvals</h3><span className="btn small">Open Insurance</span>
        </button>
        <button className="action-card" onClick={() => actions.setView("pickup")}>
          <span>Pickup</span><strong>{metrics.pickup}</strong><h3>Finish handoffs</h3><span className="btn small">Open Pickup</span>
        </button>
      </section>
    </>
  );
}

function Metric({ label, number, note }) {
  return <div className="metric"><span>{label}</span><strong>{number}</strong><small>{note}</small></div>;
}

function RepairTable({ repairs, actions }) {
  return (
    <section className="panel roster-panel">
      <div className="panel__head">
        <div><p className="kicker">Shop floor</p><h2>Repairs moving through the shop</h2></div>
        <button className="btn small" onClick={() => actions.setView("repairs")}>Open Repairs</button>
      </div>
      <div className="table-wrap">
        <table className="repair-table">
          <thead><tr><th>Customer</th><th>Vehicle</th><th>RO / Claim #</th><th>Status</th><th>ETA</th><th>Delay Reason</th><th>Next Update</th></tr></thead>
          <tbody>
            {repairs.map((repair) => (
              <tr key={repair.id}>
                <td><button className="link-button" onClick={() => actions.setView("repairs")}>{repair.customer?.name}</button></td>
                <td>{vehicleName(repair)}</td>
                <td>{repair.ro_number}<span>{repair.claim_number}</span></td>
                <td><span className="status-pill">{repair.status}</span></td>
                <td>{repair.estimated_pickup || "Not set"}</td>
                <td>{repair.delay_reason || "None"}</td>
                <td>{repair.next_update || "No update set"}</td>
              </tr>
            ))}
            {!repairs.length && <tr><td colSpan="7">No repairs yet. Add the first repair order when a vehicle checks in.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Repairs({ actions }) {
  return (
    <section className="split-layout">
      <AddRepairForm actions={actions} />
      <div className="panel">
        <div className="panel__head"><div><p className="kicker">Repair orders</p><h2>Open work</h2></div></div>
        <div className="repair-list">
          {actions.data.repairs.map((repair) => <RepairCard key={repair.id} repair={repair} actions={actions} />)}
          {!actions.data.repairs.length && <EmptyState title="No repair orders yet" body="Add the first repair when a vehicle checks in. The customer, vehicle, insurance details, pickup checklist, and status link will be created together." />}
        </div>
      </div>
    </section>
  );
}

function RepairCard({ repair, actions }) {
  const message = applyTemplate(actions.data.settings?.default_update_message, repair, actions.shop);
  const publicUrl = `${window.location.origin}/status/${repair.public_token}`;

  async function updateStatus(nextStatus) {
    const { error } = await supabase.from("repairs").update({ status: nextStatus }).eq("id", repair.id);
    if (error) return actions.toast(error.message);
    actions.toast("Repair updated.");
    actions.reload();
  }

  return (
    <article className="launch-card">
      <strong>{repair.customer?.name} / {vehicleName(repair)}</strong>
      <p>{repair.ro_number} / {repair.claim_number || "No claim number"} / <span className="status-pill">{repair.status}</span></p>
      <p>{repair.repair_notes || "No repair note entered."}</p>
      <div className="message-actions">
        <select value={repair.status} onChange={(event) => updateStatus(event.target.value)} aria-label="Update status">
          {statuses.map((status) => <option key={status}>{status}</option>)}
        </select>
        <button className="btn small" onClick={() => copyText(message)}>Copy Customer Update</button>
        <button className="btn small" onClick={() => updateStatus("Ready for Pickup")}>Mark Ready for Pickup</button>
        <button className="btn small" onClick={() => copyText(publicUrl)}>Copy Status Link</button>
        <a className="btn small" href={`sms:${repair.customer?.phone || ""}?body=${encodeURIComponent(message)}`}>Open Text</a>
        <a className="btn small" href={`mailto:${repair.customer?.email || ""}?subject=${encodeURIComponent(`Repair update for ${vehicleName(repair)}`)}&body=${encodeURIComponent(message)}`}>Open Email</a>
      </div>
    </article>
  );
}

function AddRepairForm({ actions }) {
  const [form, setForm] = useState({
    name: "", phone: "", email: "", vehicle_year: "", vehicle_make: "", vehicle_model: "",
    ro_number: "", claim_number: "", insurance_company: "", status: "Vehicle Received",
    estimated_pickup: "", delay_reason: "", next_update: "", repair_notes: ""
  });

  async function submit(event) {
    event.preventDefault();
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({ shop_id: actions.shop.id, name: form.name, phone: form.phone, email: form.email })
      .select()
      .single();

    if (customerError) return actions.toast(customerError.message);

    const { data: repair, error: repairError } = await supabase
      .from("repairs")
      .insert({
        shop_id: actions.shop.id,
        customer_id: customer.id,
        vehicle_year: form.vehicle_year,
        vehicle_make: form.vehicle_make,
        vehicle_model: form.vehicle_model,
        ro_number: form.ro_number,
        claim_number: form.claim_number,
        insurance_company: form.insurance_company,
        status: form.status,
        estimated_pickup: form.estimated_pickup,
        delay_reason: form.delay_reason,
        next_update: form.next_update,
        repair_notes: form.repair_notes,
        public_token: crypto.randomUUID()
      })
      .select()
      .single();

    if (repairError) return actions.toast(repairError.message);

    await supabase.from("pickup_checklists").insert(
      checklistLabels.map((label, index) => ({ shop_id: actions.shop.id, repair_id: repair.id, label, done: false, sort_order: index }))
    );

    setForm({ ...form, name: "", ro_number: "", claim_number: "", repair_notes: "" });
    actions.toast("Repair added.");
    actions.reload();
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <p className="kicker">New repair</p>
      <h2>Add repair order</h2>
      <div className="form-grid">
        {field("Customer name", "name", form, setForm)}
        {field("Phone", "phone", form, setForm)}
        {field("Email", "email", form, setForm)}
        {field("Year", "vehicle_year", form, setForm)}
        {field("Make", "vehicle_make", form, setForm)}
        {field("Model", "vehicle_model", form, setForm)}
        {field("RO number", "ro_number", form, setForm)}
        {field("Claim number", "claim_number", form, setForm)}
        {field("Insurance company", "insurance_company", form, setForm)}
        <label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        {field("Estimated pickup", "estimated_pickup", form, setForm)}
        {field("Delay reason", "delay_reason", form, setForm)}
      </div>
      {field("Next update", "next_update", form, setForm)}
      <label>Repair notes<textarea value={form.repair_notes} onChange={(event) => setForm({ ...form, repair_notes: event.target.value })} /></label>
      <button className="btn primary">Add Repair</button>
    </form>
  );
}

function field(label, key, form, setForm) {
  return <label>{label}<input value={form[key] || ""} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>;
}

function Customers({ actions }) {
  return (
    <section className="panel">
      <p className="kicker">Customers</p><h2>People with cars in the shop</h2>
      <div className="launch-grid">
        {actions.data.customers.map((customer) => (
          <article className="launch-card" key={customer.id}>
            <strong>{customer.name}</strong>
            <p>{customer.phone || "No phone"} / {customer.email || "No email"}</p>
          </article>
        ))}
        {!actions.data.customers.length && <EmptyState title="No customers yet" body="Customers are created when a repair order is added." />}
      </div>
    </section>
  );
}

function Parts({ actions }) {
  const [form, setForm] = useState({ repair_id: "", name: "", status: "Ordered", eta: "", delay_reason: "" });

  async function submit(event) {
    event.preventDefault();
    const { error } = await supabase.from("parts").insert({ ...form, shop_id: actions.shop.id });
    if (error) return actions.toast(error.message);
    setForm({ repair_id: "", name: "", status: "Ordered", eta: "", delay_reason: "" });
    actions.toast("Part delay saved.");
    actions.reload();
  }

  return (
    <section className="split-layout">
      <form className="panel form" onSubmit={submit}>
        <p className="kicker">Parts</p><h2>Add part delay</h2>
        <RepairSelect value={form.repair_id} repairs={actions.data.repairs} onChange={(value) => setForm({ ...form, repair_id: value })} />
        {field("Part name", "name", form, setForm)}
        {field("Status", "status", form, setForm)}
        {field("ETA", "eta", form, setForm)}
        {field("Delay reason", "delay_reason", form, setForm)}
        <button className="btn primary">Add Part Delay</button>
      </form>
      <RecordList title="Parts board" records={actions.data.parts} map={(part) => [part.name, part.status, part.eta, part.delay_reason]} />
    </section>
  );
}

function Insurance({ actions }) {
  const [form, setForm] = useState({ repair_id: "", note: "", supplement_status: "", adjuster_contact: "", approval_status: "" });

  async function submit(event) {
    event.preventDefault();
    const { error } = await supabase.from("insurance_notes").insert({ ...form, shop_id: actions.shop.id });
    if (error) return actions.toast(error.message);
    setForm({ repair_id: "", note: "", supplement_status: "", adjuster_contact: "", approval_status: "" });
    actions.toast("Insurance note saved.");
    actions.reload();
  }

  return (
    <section className="split-layout">
      <form className="panel form" onSubmit={submit}>
        <p className="kicker">Insurance</p><h2>Add claim note</h2>
        <RepairSelect value={form.repair_id} repairs={actions.data.repairs} onChange={(value) => setForm({ ...form, repair_id: value })} />
        {field("Supplement status", "supplement_status", form, setForm)}
        {field("Adjuster contact", "adjuster_contact", form, setForm)}
        {field("Approval status", "approval_status", form, setForm)}
        <label>Claim note<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
        <button className="btn primary">Add Insurance Note</button>
      </form>
      <RecordList title="Claim notes" records={actions.data.insurance_notes} map={(note) => [note.supplement_status, note.adjuster_contact, note.approval_status, note.note]} />
    </section>
  );
}

function Photos({ actions }) {
  const [repairId, setRepairId] = useState("");
  const [label, setLabel] = useState(photoLabels[0]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function uploadFiles(files) {
    const repair = actions.data.repairs.find((item) => item.id === repairId);
    if (!repair) return actions.toast("Choose a repair first.");
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;

    const invalidFile = selectedFiles.find((file) => !file.type.startsWith("image/") || file.size > 10 * 1024 * 1024);
    if (invalidFile) return actions.toast("Upload images only. Maximum file size is 10 MB.");

    setUploading(true);
    for (const file of selectedFiles) {
      const path = `${actions.shop.id}/${repair.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("repair-photos").upload(path, file);
      if (uploadError) {
        setUploading(false);
        return actions.toast(uploadError.message);
      }

      const { data } = supabase.storage.from("repair-photos").getPublicUrl(path);
      const { error } = await supabase.from("photo_updates").insert({
        shop_id: actions.shop.id,
        repair_id: repair.id,
        label,
        file_path: path,
        url: data.publicUrl,
        is_customer_visible: true
      });
      if (error) {
        setUploading(false);
        return actions.toast(error.message);
      }
    }

    setUploading(false);
    actions.toast("Photo uploaded.");
    actions.reload();
  }

  return (
    <section className="split-layout">
      <div className="panel form">
        <p className="kicker">Photos</p><h2>Upload repair photos</h2>
        <RepairSelect value={repairId} repairs={actions.data.repairs} onChange={setRepairId} />
        <label>Photo label<select value={label} onChange={(event) => setLabel(event.target.value)}>{photoLabels.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className={`drop-zone ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); uploadFiles(event.dataTransfer.files); }}>
          <input type="file" multiple accept="image/*" onChange={(event) => uploadFiles(event.target.files)} />
          <span className="drop-zone__button"><span>+</span><strong>{uploading ? "Uploading..." : "Choose Files"}</strong></span>
          <p>Drag photos here or choose files from the computer.</p>
          <small>Images only. Max 10 MB each. Uploaded photos are visible on the customer status page.</small>
        </label>
      </div>
      <div className="panel">
        <p className="kicker">Photo proof</p><h2>Recent uploads</h2>
        <div className="photo-grid">
          {actions.data.photo_updates.map((photo) => (
            <a className="photo-card" href={photo.url} target="_blank" rel="noreferrer" key={photo.id}>
              <img src={photo.url} alt={photo.label} /><span>{photo.label}</span>
            </a>
          ))}
          {!actions.data.photo_updates.length && <EmptyState title="No photos uploaded" body="Choose a repair record, pick a label, and upload repair photos from this screen." />}
        </div>
      </div>
    </section>
  );
}

function Pickup({ actions }) {
  async function toggle(item) {
    await supabase.from("pickup_checklists").update({ done: !item.done }).eq("id", item.id);
    actions.reload();
  }

  return (
    <section className="panel">
      <p className="kicker">Pickup</p><h2>Pickup checklist</h2>
      <div className="pickup-board">
        {actions.data.repairs.map((repair) => {
          const items = actions.data.pickup_checklists.filter((item) => item.repair_id === repair.id);
          return (
            <article className="pickup-card" key={repair.id}>
              <div className="pickup-card__head"><div><strong>{repair.customer?.name}</strong><span>{vehicleName(repair)} / {repair.ro_number}</span></div><span className="status-pill">{repair.status}</span></div>
              <div className="checklist">
                {items.map((item) => <label className="check-row" key={item.id}><input type="checkbox" checked={item.done} onChange={() => toggle(item)} />{item.label}</label>)}
              </div>
            </article>
          );
        })}
        {!actions.data.repairs.length && <EmptyState title="No pickup checklists yet" body="Pickup checklist items are created automatically when a repair order is added." />}
      </div>
    </section>
  );
}

function Updates({ actions }) {
  async function saveReviewMessage(repair, body, messageType) {
    const { error } = await supabase.from("review_messages").insert({
      shop_id: actions.shop.id,
      repair_id: repair.id,
      message_type: messageType,
      body
    });
    if (error) return actions.toast(error.message);
    actions.toast("Message saved.");
    actions.reload();
  }

  return (
    <section className="panel">
      <p className="kicker">Customer updates</p><h2>Messages ready to send</h2>
      <div className="message-picker">
        {actions.data.repairs.map((repair) => {
          const update = applyTemplate(actions.data.settings?.default_update_message, repair, actions.shop);
          const review = `Thanks for trusting ${actions.shop.name} with your ${vehicleName(repair)}. If everything looks good after pickup, a review helps local drivers find our shop: ${actions.shop.google_review_link || "review link not set"}`;
          const checkIn = `Hi ${repair.customer?.name}, this is ${actions.shop.name}. It has been 30 days since pickup. Reply here if anything needs a second look.`;
          return (
            <article className="message-card" key={repair.id}>
              <h3>{repair.customer?.name} / {vehicleName(repair)}</h3>
              <pre>{update}</pre>
              <div className="message-actions">
                <button className="btn small" onClick={() => copyText(update)}>Copy Update</button>
                <a className="btn small" href={`sms:${repair.customer?.phone || ""}?body=${encodeURIComponent(update)}`}>Open Text</a>
                <a className="btn small" href={`mailto:${repair.customer?.email || ""}?subject=Repair update&body=${encodeURIComponent(update)}`}>Open Email</a>
                <button className="btn small" onClick={() => { copyText(review); saveReviewMessage(repair, review, "review_request"); }}>Copy Review Request</button>
                <button className="btn small" onClick={() => { copyText(checkIn); saveReviewMessage(repair, checkIn, "30_day_check_in"); }}>Copy 30-day Check-in</button>
              </div>
            </article>
          );
        })}
        {!actions.data.repairs.length && <EmptyState title="No messages yet" body="Customer update drafts appear after repair orders are added." />}
      </div>
    </section>
  );
}

function Settings({ actions }) {
  const [form, setForm] = useState({
    name: actions.shop.name || "",
    phone: actions.shop.phone || "",
    address: actions.shop.address || "",
    google_review_link: actions.shop.google_review_link || "",
    default_update_message: actions.data.settings?.default_update_message || "Hi {customer}, this is {shop}. Your {vehicle} is currently at {status}. ETA is {eta}. Current note: {nextUpdate}."
  });
  const [invite, setInvite] = useState({ email: "", role: "service_advisor" });

  async function saveSettings(event) {
    event.preventDefault();
    const { error: shopError } = await supabase.from("shops").update({
      name: form.name,
      phone: form.phone,
      address: form.address,
      google_review_link: form.google_review_link
    }).eq("id", actions.shop.id);
    if (shopError) return actions.toast(shopError.message);

    const { error } = await supabase.from("settings").upsert({
      shop_id: actions.shop.id,
      default_update_message: form.default_update_message
    }, { onConflict: "shop_id" });
    if (error) return actions.toast(error.message);

    actions.toast("Settings saved.");
    actions.reload();
  }

  async function sendInvite(event) {
    event.preventDefault();
    const { error } = await supabase.from("team_invitations").insert({
      shop_id: actions.shop.id,
      email: invite.email,
      role: invite.role,
      invited_by: actions.session.user.id
    });
    if (error) return actions.toast(error.message);
    setInvite({ ...invite, email: "" });
    actions.toast("Invitation saved.");
    actions.reload();
  }

  async function checkout() {
    const response = await fetch("/.netlify/functions/create-checkout-session", {
      method: "POST",
      body: JSON.stringify({
        shopId: actions.shop.id,
        email: actions.session.user.email,
        siteUrl: window.location.origin
      })
    });
    const payload = await response.json();
    if (payload.url) window.location.href = payload.url;
    else actions.toast(payload.error || "Stripe checkout is not ready.");
  }

  return (
    <section className="split-layout">
      <form className="panel form" onSubmit={saveSettings}>
        <p className="kicker">Settings</p><h2>Shop details</h2>
        {field("Shop name", "name", form, setForm)}
        {field("Phone", "phone", form, setForm)}
        {field("Address", "address", form, setForm)}
        {field("Google review link", "google_review_link", form, setForm)}
        <label>Default customer update message<textarea value={form.default_update_message} onChange={(event) => setForm({ ...form, default_update_message: event.target.value })} /></label>
        <button className="btn primary">Save Settings</button>
      </form>

      <div className="stack">
        <form className="panel form" onSubmit={sendInvite}>
          <p className="kicker">Team</p><h2>Invite a teammate</h2>
          <div className="form-grid">
            <label>Email<input value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} /></label>
            <label>Role<select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value })}><option value="service_advisor">Service advisor</option><option value="manager">Manager</option></select></label>
          </div>
          <button className="btn primary">Send Invitation</button>
          <p className="muted">Invitations are stored in Supabase. Connect your email provider to send the actual email.</p>
          <div className="invite-list">
            {actions.data.team_invitations.map((row) => (
              <p key={row.id}><strong>{row.email}</strong> / {row.role} / {row.status}</p>
            ))}
          </div>
        </form>
        <section className="panel">
          <p className="kicker">Billing</p><h2>Subscription</h2>
          <p className="muted">Current status: <strong>{actions.shop.subscription_status || "trialing"}</strong></p>
          <p className="muted">{billingMessage()}</p>
          <button className="btn primary" onClick={checkout}>Open Stripe Checkout</button>
        </section>
      </div>
    </section>
  );
}

function RepairSelect({ value, repairs, onChange }) {
  return (
    <label>Repair record
      <select value={value} onChange={(event) => onChange(event.target.value)} required>
        <option value="">Choose a repair</option>
        {repairs.map((repair) => <option key={repair.id} value={repair.id}>{repair.customer?.name} / {repair.ro_number}</option>)}
      </select>
    </label>
  );
}

function RecordList({ title, records, map }) {
  return (
    <section className="panel">
      <p className="kicker">Records</p><h2>{title}</h2>
      <div className="launch-grid">
        {records.map((record) => {
          const [primary, secondary, third, fourth] = map(record);
          return <article className="launch-card" key={record.id}><strong>{primary || "Not set"}</strong><p>{secondary || "No status"} / {third || "No ETA"}</p><p>{fourth || "No note"}</p></article>;
        })}
        {!records.length && <EmptyState title="No records yet" body="New records will appear here after they are added." />}
      </div>
    </section>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    const { error } = mode === "sign-in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setMessage(error ? error.message : mode === "sign-in" ? "Signed in." : "Check your email if confirmation is turned on.");
  }

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <img src="/assets/logo.png" alt="ClaimTrack" />
        <h1>{mode === "sign-in" ? "Sign in to ClaimTrack" : "Create your ClaimTrack account"}</h1>
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength="6" /></label>
        <button className="btn primary">{mode === "sign-in" ? "Sign In" : "Create Account"}</button>
        <button className="link-button" type="button" onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}>
          {mode === "sign-in" ? "Create a new shop account" : "I already have an account"}
        </button>
        {message && <p className="muted">{message}</p>}
      </form>
    </main>
  );
}

function Onboarding({ session, onReady }) {
  const [form, setForm] = useState({ name: "", phone: "", address: "", google_review_link: "" });
  const [errorMessage, setErrorMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    setErrorMessage("");
    const { data: shop, error } = await supabase.from("shops").insert({
      owner_id: session.user.id,
      name: form.name,
      phone: form.phone,
      address: form.address,
      google_review_link: form.google_review_link
    }).select().single();
    if (error) return setErrorMessage(error.message);

    const { error: memberError } = await supabase.from("team_members").insert({ shop_id: shop.id, user_id: session.user.id, role: "owner" });
    if (memberError) return setErrorMessage(memberError.message);

    const { error: settingsError } = await supabase.from("settings").insert({ shop_id: shop.id, default_update_message: "Hi {customer}, this is {shop}. Your {vehicle} is currently at {status}. ETA is {eta}. Current note: {nextUpdate}." });
    if (settingsError) return setErrorMessage(settingsError.message);

    onReady();
  }

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <img src="/assets/logo.png" alt="ClaimTrack" />
        <h1>Set up your shop</h1>
        <p className="muted">Add the shop details service advisors will use on customer updates and pickup messages.</p>
        {field("Shop name", "name", form, setForm)}
        {field("Phone", "phone", form, setForm)}
        {field("Address", "address", form, setForm)}
        {field("Google review link", "google_review_link", form, setForm)}
        <button className="btn primary">Create Shop</button>
        {errorMessage && <p className="error-text">{errorMessage}</p>}
      </form>
    </main>
  );
}

function CustomerStatus({ token }) {
  const [repair, setRepair] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    async function load() {
      const { data } = await supabase.rpc("get_public_repair_status", { token_input: token });
      setRepair(data?.repair || null);
      setPhotos(data?.photos || []);
      setChecklist(data?.checklist || []);
      setLoading(false);
    }
    load();
  }, [token]);

  if (!hasSupabaseConfig) return <ConfigScreen />;
  if (loading) return <ShellNotice title="Loading repair status" body="Checking the repair link." />;
  if (!repair) return <ShellNotice title="Repair link not found" body="Call the shop if you expected to see a repair status here." />;

  return (
    <main className="public-status">
      <section className="panel">
        <p className="kicker">{repair.shop_name || "Repair status"}</p>
        <h1>{repair.customer_name}, here is the latest update.</h1>
        <div className="metrics">
          <Metric label="Vehicle" number={vehicleName(repair)} note={repair.ro_number} />
          <Metric label="Status" number={repair.status} note="Current shop step" />
          <Metric label="Pickup" number={repair.estimated_pickup || "Not set"} note="Estimated pickup" />
          <Metric label="Next update" number={repair.next_update || "Not set"} note="What happens next" />
        </div>
        <p className="large-copy">{repair.repair_notes || "The shop has not posted a repair note yet."}</p>
      </section>
      <section className="panel">
        <p className="kicker">Photos</p><h2>Repair photos</h2>
        <div className="photo-grid">{photos.map((photo) => <a className="photo-card" href={photo.url} key={photo.id}><img src={photo.url} alt={photo.label} /><span>{photo.label}</span></a>)}</div>
        {!photos.length && <EmptyState title="No photos posted yet" body="The shop will add photos when there is something useful to show." />}
      </section>
      <section className="panel">
        <p className="kicker">Pickup</p><h2>Pickup checklist</h2>
        <div className="checklist">{checklist.map((item) => <label className="check-row" key={item.id}><input type="checkbox" checked={item.done} readOnly />{item.label}</label>)}</div>
        {!checklist.length && <p className="muted">Pickup steps will appear here when the shop starts the handoff process.</p>}
      </section>
    </main>
  );
}

function ConfigScreen() {
  return <ShellNotice title="Connect Supabase" body="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env, then restart npm run dev on port 5500." />;
}

function ShellNotice({ title, body }) {
  return <main className="auth-screen"><section className="auth-card"><img src="/assets/logo.png" alt="ClaimTrack" /><h1>{title}</h1><p className="muted">{body}</p></section></main>;
}

function pageTitle(view) {
  return {
    repairs: "Repair orders",
    customers: "Customers",
    parts: "Parts board",
    insurance: "Insurance notes",
    photos: "Repair photos",
    pickup: "Pickup checklist",
    updates: "Customer updates",
    settings: "Shop settings"
  }[view] || "Shop repair board";
}

function showToast(setToast, message) {
  setToast(message);
  window.setTimeout(() => setToast(""), 2600);
}

function EmptyState({ title, body }) {
  return <article className="empty-state"><strong>{title}</strong><p>{body}</p></article>;
}

function BillingRequired({ actions }) {
  return (
    <section className="panel billing-lock">
      <p className="kicker">Billing</p>
      <h2>Subscription needed</h2>
      <p className="muted">This shop is not active right now. Open Settings to start Stripe Checkout or update the subscription status.</p>
      <button className="btn primary" onClick={() => actions.setView("settings")}>Open Settings</button>
    </section>
  );
}

function billingMessage() {
  const status = new URLSearchParams(window.location.search).get("billing");
  if (status === "success") return "Stripe returned a successful checkout. Use the Stripe webhook or update the shop subscription status after payment clears.";
  if (status === "cancelled") return "Stripe checkout was cancelled. Dashboard access depends on subscription status.";
  return "Trialing and active shops can use the dashboard. Past due, canceled, or unpaid shops are sent here.";
}

function exportJson(shop, data) {
  const blob = new Blob([JSON.stringify({ shop, ...data }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "claimtrack-export.json";
  link.click();
  URL.revokeObjectURL(url);
}
