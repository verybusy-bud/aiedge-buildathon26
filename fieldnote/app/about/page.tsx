import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Github } from 'lucide-react';
import { repositoryUrl } from '@/lib/project';

export const metadata:Metadata={title:'About Fieldnote',description:'Reliable local information, without the noise.'};

export default function AboutPage(){
 return <div className="about-page">
  <header className="about-topbar"><Link className="wordmark" href="/">FIELDNOTE.</Link><nav aria-label="About navigation"><Link href="/">Local stories</Link><a href={repositoryUrl} target="_blank" rel="noopener noreferrer">GitHub<ArrowUpRight size={15}/></a></nav></header>
  <main id="main" className="about-main">
   <Link href="/" className="back-button"><ArrowLeft size={16}/>Back to stories</Link>
   <div className="about-hero"><span className="eyebrow">ABOUT FIELDNOTE</span><h1>LOCAL INFORMATION.<br/>LESS NOISE.</h1><p>Local news and events for Sioux Falls, kept clear, searchable, and easy to scan.</p></div>
   <p className="purpose-note">Reports about the same event stay together. Each person’s account stays separate. More reports add context, not certainty.</p>
   <section className="purpose-note"><strong>How this release works</strong><p>Profiles, reports, and saved media stay in this browser. They are not shared with other visitors or devices. The feed begins with community reports; Fieldnote does not invent local updates.</p></section>
   <a className="primary" href={repositoryUrl} target="_blank" rel="noopener noreferrer"><Github size={17}/>View the source<ArrowUpRight size={15}/></a>
   <details className="technical-details"><summary>Technical details</summary>
    <section className="technical-section"><span className="section-index">01</span><div><h2>Architecture</h2><p>Next.js, React, and TypeScript power the interface. This release stores text in localStorage, images and video in IndexedDB, and the active profile in sessionStorage. No remote database is used.</p><p>Profiles and reports are available only in the same browser. They do not sync across devices or between visitors. Clearing site data removes locally stored information.</p></div></section>
    <section className="technical-section"><span className="section-index">02</span><div><h2>Search and grouping</h2><p>Search covers report text, place names, and themes such as food, traffic, and special events. Similar reports can be grouped under one event while each account stays distinct.</p><p>Grouping and moderation help organize information. They cannot establish that a report is true.</p></div></section>
    <section className="technical-section"><span className="section-index">03</span><div><h2>Reading a report</h2><p>Context uses the number of separate accounts, capture records, recency, moderator review, and conflicting accounts. Scores can change and are not proof of accuracy. Multiple accounts may not be independent.</p><p>A file hash identifies a file; it does not prove where, when, or how the image was made. No AI detector is integrated.</p></div></section>
    <section className="technical-section"><span className="section-index">04</span><div><h2>Privacy and media</h2><p>Locations are approximate and Fieldnote does not request GPS. Camera captures are processed in this browser. Do not include private addresses or identifying details about bystanders.</p><p>Browser storage is not secure account storage. Do not post sensitive information.</p></div></section>
    <section className="technical-section"><span className="section-index">05</span><div><h2>Design and source</h2><p>Brand red is #70020F. Anton headings are served locally with their license. Body text uses Arial Unicode MS when installed, with Arial fallback. No external font service is used.</p><p>Fieldnote’s source and implementation details are available on GitHub.</p></div></section>
   </details>
   <footer className="about-footer"><Link href="/">Local stories</Link><Link href="/support">Support Fieldnote</Link><Link href="/supporter">Supporter</Link><Link href="/advertise">Advertise</Link><a href={repositoryUrl} target="_blank" rel="noopener noreferrer">GitHub<ArrowUpRight size={14}/></a></footer>
  </main>
 </div>;
}