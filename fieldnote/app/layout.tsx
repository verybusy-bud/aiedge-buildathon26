import type { Metadata, Viewport } from 'next';
import './globals.css';
import './brand.css';
export const metadata:Metadata={title:'Fieldnote — See it. Share it. Compare it.',description:'Separate witness accounts. A clearer picture of what is happening around Sioux Falls.',manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg',apple:'/icon.svg'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#70020F'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
