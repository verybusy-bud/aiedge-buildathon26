'use client';
import { useActionState } from 'react';
import { updatePasswordAction, type ActionResult } from '@/app/actions';
const initial:ActionResult={ok:false,message:''};
export function ResetPasswordForm(){const [state,action,pending]=useActionState(updatePasswordAction,initial);return <section className="auth-card"><span className="eyebrow">ACCOUNT ACCESS</span><h1>Choose a new password</h1><p>Use at least 12 characters. Your password is handled by the authentication provider.</p><form action={action}><label className="field"><span>New password</span><input name="password" type="password" minLength={12} autoComplete="new-password" required/></label><button className="button primary" disabled={pending}>{pending?'Saving…':'Update password'}</button></form>{state.message&&<p className={state.ok?'notice':'error'}>{state.message}</p>}</section>;}
