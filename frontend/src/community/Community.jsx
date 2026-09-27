import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { useSession } from "../lib/session";
import { useProfile } from "../lib/profile.jsx";
import { Alert, Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, SkeletonList, Textarea, formatRelative } from "../components/ui.jsx";
import { ChatIcon, UsersIcon } from "../components/icons.jsx";

function Comments({ post, author }) {
  const [comments, setComments] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiClient.get(`/community/posts/${post.id}/comments`).then(setComments).catch(() => setComments([]));
  }, [post.id]);

  async function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const c = await apiClient.post(`/community/posts/${post.id}/comments`, { ...author, body: text });
      setComments((prev) => [...(prev || []), c]);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2 border-t border-stone-100 pt-3">
      {comments?.map((c) => (
        <div key={c.id} className="flex gap-2">
          <Avatar name={c.author_name || "?"} size="sm" />
          <div className="rounded-2xl bg-stone-100 px-3 py-2 text-sm">
            <p className="text-xs font-bold text-stone-800">
              {c.author_name} {c.author_type === "supplier" && <Badge tone="blue">Supplier</Badge>}
            </p>
            <p className="text-stone-700">{c.body}</p>
          </div>
        </div>
      ))}
      {author && (
        <form onSubmit={add} className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply…" />
          <Button type="submit" loading={busy} disabled={!text.trim()}>
            Reply
          </Button>
        </form>
      )}
    </div>
  );
}

export default function Community() {
  const { role, me } = useSession();
  const { profile } = useProfile();
  const [posts, setPosts] = useState(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [scope, setScope] = useState("all");
  const author = role === "farmer" || role === "supplier" ? { author_type: role, author_id: me.id } : null;

  useEffect(() => {
    const q = scope === "barangay" && profile?.barangay ? `?barangay=${encodeURIComponent(profile.barangay)}` : "";
    apiClient.get(`/community/posts${q}`).then(setPosts).catch(() => setPosts([]));
  }, [scope, profile?.barangay]);

  async function post(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await apiClient.post("/community/posts", { ...author, body: text });
      setPosts((prev) => [created, ...(prev || [])]);
      setText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 p-6 text-white">
        <UsersIcon className="h-8 w-8 text-brand-300" />
        <h1 className="mt-2 text-2xl font-extrabold italic">Stronger Farmers, Stronger Communities</h1>
        <p className="mt-1 text-sm text-brand-50/85">Share tips, ask neighbors, and find out who else needs inputs this season.</p>
      </div>
      {author && (
        <Card className="mb-5 p-4">
          <form onSubmit={post} className="space-y-3">
            {error && <Alert tone="error">{error}</Alert>}
            <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ano ang gusto mong ibahagi? / What would you like to share?" maxLength={2000} />
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-500">{role === "farmer" ? "+1 AgriPoint for sharing" : ""}</span>
              <Button type="submit" loading={busy} disabled={!text.trim()}>
                Post
              </Button>
            </div>
          </form>
        </Card>
      )}
      {profile?.barangay && (
        <div className="mb-4 flex gap-2">
          {[
            ["all", "Everyone"],
            ["barangay", `Brgy. ${profile.barangay}`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setScope(key)}
              className={scope === key ? "rounded-full bg-brand-700 px-4 py-1.5 text-sm font-semibold text-white" : "rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-stone-600 ring-1 ring-stone-200"}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {posts === null ? (
        <SkeletonList rows={3} />
      ) : posts.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No posts yet" description="Be the first to share something with your community." />
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-center gap-3">
                <Avatar name={p.author_name || "?"} />
                <div>
                  <p className="font-bold text-stone-900">
                    {p.author_name} {p.author_type === "supplier" && <Badge tone="blue">Supplier</Badge>}
                  </p>
                  <p className="text-xs text-stone-500">
                    {p.barangay ? `Brgy. ${p.barangay} · ` : ""}
                    {formatRelative(p.created_at)}
                  </p>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-[15px] text-stone-800">{p.body}</p>
              <button
                type="button"
                onClick={() => setOpen(open === p.id ? null : p.id)}
                className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-stone-500 hover:text-brand-700"
              >
                <ChatIcon className="h-4 w-4" /> {p.comment_count ? `${p.comment_count} replies` : "Reply"}
              </button>
              {open === p.id && <Comments post={p} author={author} />}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
