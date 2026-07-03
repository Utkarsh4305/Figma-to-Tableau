import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import Reveal from "../components/ui/Reveal";

interface Post {
  date: string;
  tag: string;
  color: string;
  title: string;
  excerpt: string;
  body: React.ReactNode;
}

const POSTS: Post[] = [
  {
    date: "July 2026",
    tag: "Release",
    color: "#f4512c",
    title: "Image mode: when you just want the pixels",
    excerpt:
      "Sometimes the deliverable isn't a live dashboard — it's a picture of one. Image is now a third export mode alongside Floating and Tiled.",
    body: (
      <>
        <p>
          Floating mode rebuilds your design as live zones; Tiled rebuilds it as responsive
          containers. But a surprising number of teams asked for something simpler: <b>ship the
          frame as one PNG inside a workbook</b>, for sign-off decks, static hand-offs, or
          "let me see it in Tableau before we wire data".
        </p>
        <p>
          So the export bar now has three pills: <code>Floating</code>, <code>Tiled</code> and{" "}
          <code>Image</code>. Image mode rasterizes the whole frame and emits a single-image
          dashboard — no worksheets, no zones, nothing to break. It's also the fastest export by far.
        </p>
      </>
    ),
  },
  {
    date: "July 2026",
    tag: "Engineering",
    color: "#8a4dff",
    title: "Making tiled dashboards behave",
    excerpt:
      "Tableau's tiled layout engine has opinions. Four round-trips with real workbooks taught us which layout hints it actually honors — and which ones silently produce sliver columns.",
    body: (
      <>
        <p>
          Floating export is easy to reason about: every zone gets exact coordinates. Tiled is a
          different animal — Tableau distributes space through containers, and the rules are…
          undocumented. Our first attempts produced one-character-per-line vertical text and
          invisible sheets.
        </p>
        <p>
          After several rounds of exporting reference workbooks from Tableau itself and diffing
          the XML, we landed on a trust list: <b>height pins inside vertical stacks are reliable;
          distribute-evenly on horizontal rows is reliable; width pins under distribute-evenly are
          ignored</b>; and strategy-less unequal rows collapse into slivers. The tiled exporter now
          only ever emits patterns from that list — worst case degrades to a graceful 50/50 split
          instead of a crushed layout.
        </p>
        <p>
          Filters got their own fix: they now live in a height-pinned top bar instead of a
          sidebar, because Tableau equalizes sidebar widths no matter what you ask for.
        </p>
      </>
    ),
  },
  {
    date: "July 2026",
    tag: "Product",
    color: "#0aa268",
    title: "Free plan, Premium, and how licensing works",
    excerpt:
      "The full feature set is free for your first 15 exports. Here's how the license model works and why there are no license keys to paste.",
    body: (
      <>
        <p>
          Everything — worksheet swap, navigation, all three export modes, all 15 templates — is
          available on the free plan for <b>15 exports</b>. After that, Premium is $10/month for
          unlimited exports.
        </p>
        <p>
          The license is keyed to your <b>Figma user id</b>: checkout opens from the plugin's
          Account tab with your account already linked, Razorpay handles payment, and the license
          activates server-side. No keys, nothing to paste. The plugin re-checks once per session
          and keeps working offline for 3 days between checks.
        </p>
      </>
    ),
  },
  {
    date: "June 2026",
    tag: "Engineering",
    color: "#dd7714",
    title: "Text that never clips",
    excerpt:
      "Tableau renders text about 1.5x larger than Figma and mangles partially-overlapping text zones. The fitting engine measures every string and makes clipping impossible.",
    body: (
      <>
        <p>
          The nastiest fidelity bug we found: a floating text zone that <b>partially</b> overlaps
          another zone gets mangled by Tableau — only the overhang renders. Fully contained is
          fine. And there's no soft-wrap, so a zone that's one pixel too narrow ellipsizes.
        </p>
        <p>
          The fix became a text-fitting engine: every string is measured with per-character GDI
          width tables, zones grow only into space that's actually free (their enclosing card,
          minus disjoint neighbors), fonts shrink to fit as a last resort, and every emitted font
          size is normalized by Tableau's ~1.5x rendering factor so text occupies the same visual
          space it did in Figma. Multi-line text is split into per-line zones because Tableau
          ellipsizes multi-line formatted text.
        </p>
        <p>
          The result: your copy lands exactly where — and how big — you designed it.
        </p>
      </>
    ),
  },
  {
    date: "June 2026",
    tag: "Engineering",
    color: "#18a0fb",
    title: "Navigation buttons Tableau actually loads",
    excerpt:
      "Figma prototype links become native Tableau navigation. Getting there meant discovering that Tableau's own <button> object crashes floating dashboards.",
    body: (
      <>
        <p>
          Wire a "Navigate to" interaction between frames in Figma, name the layer{" "}
          <code>Nav/Details</code>, and the export contains a working Tableau navigation button.
          Simple on the surface — but the first implementation used Tableau's native{" "}
          <code>&lt;button&gt;</code> dashboard object, which turns out to <b>crash the loader in
          floating dashboards</b> (it only works tiled).
        </p>
        <p>
          The shipping version emits <code>nav-action</code> workbook actions instead, the same
          mechanism Tableau's UI uses under the hood — confirmed loading in Tableau 2026.2. As a
          bonus, destination frames you forgot to select are pulled into the export automatically,
          and pointing a prototype link at a <code>SHEET/</code> layer opens that worksheet.
        </p>
      </>
    ),
  },
];

function PostCard({ post }: { post: Post }) {
  const [open, setOpen] = useState(false);
  return (
    <Reveal>
      <article className="post">
        <button className="post__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <div className="post__meta">
            <span className="post__tag" style={{ background: `${post.color}1f`, color: post.color }}>
              {post.tag}
            </span>
            {post.date}
          </div>
          <h2>{post.title}</h2>
          <p className="post__excerpt">{post.excerpt}</p>
          <span className="post__more">
            {open ? "Close" : "Read the story"}
            <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.3 }} style={{ display: "inline-flex" }}>
              <ChevronDown size={15} strokeWidth={2.5} />
            </motion.span>
          </span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              className="post__body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="post__body-inner">{post.body}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </article>
    </Reveal>
  );
}

export default function Blog() {
  return (
    <>
      <div className="page-hero">
        <div className="container">
          <span className="eyebrow"><span className="dot" />Blog</span>
          <h1>
            Notes from the <span className="grad-text">workbook factory.</span>
          </h1>
          <p className="page-hero__blurb">
            Release notes, Tableau internals we learned the hard way, and how the plugin is built.
          </p>
        </div>
      </div>
      <div className="container">
        <div className="blog-list">
          {POSTS.map((p) => (
            <PostCard key={p.title} post={p} />
          ))}
        </div>
      </div>
    </>
  );
}
