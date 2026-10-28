import type { Metadata, Viewport } from 'next';
import './globals.css';
import './brand.css';
export const metadata:Metadata={title:'Fieldnote — Sioux Falls news & events',description:'Sioux Falls local news, food, traffic, and special events. Reports about the same event, together in one place.',manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg',apple:'/icon.svg'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#70020F'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
