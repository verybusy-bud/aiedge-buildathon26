import { NextRequest,NextResponse } from 'next/server';
import { session } from '@/lib/server';
export async function GET(req:NextRequest){const code=req.nextUrl.searchParams.get('code');if(code){const db=await session();const {error}=await db.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL('/',req.url));}return NextResponse.redirect(new URL('/?auth_error=1',req.url));}
