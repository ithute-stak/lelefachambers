import Link from "next/link";

export default function ChambersAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div style={{background:"#171012",color:"#f5ede4",borderBottom:"1px solid rgba(255,255,255,.12)"}}>
        <div style={{width:"min(1180px,calc(100% - 40px))",margin:"0 auto",minHeight:46,display:"flex",alignItems:"center",gap:18,fontSize:13,fontWeight:750,flexWrap:"wrap",padding:"7px 0"}}>
          <img className="admin-brand-mark" src="/brand/lelefa-chambers-mark.png" alt="" width={30} height={30} />
          <span style={{color:"#cda461",textTransform:"uppercase",letterSpacing:1.2,fontSize:11}}>Chambers Administration</span>
          <Link href="/chambers-admin">Website CMS</Link>
          <Link href="/chambers-admin/operations">Legal Operations</Link>
          <Link href="/chambers-admin/recovery">Recovery & Client Portal</Link>
          <Link href="/chambers-admin/automation">Automation & Ithute Pay</Link>
          <Link href="/" style={{marginLeft:"auto",opacity:.75}}>Public website</Link>
        </div>
      </div>
      {children}
    </>
  );
}
