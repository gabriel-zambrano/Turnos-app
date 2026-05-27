'use client'
import { useState, useEffect } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { PageHeader, BtnPrimary, BtnSm, groupCss, labelCss, inputCss, selectCss, Toast, Spinner, DataTable, TR, TD, Badge, overlayCss, modalCss, modalTitleCss, footerCss, btnLightCss } from '@/components/UI'
import { createClient } from '@/lib/supabase/client'
import { useTenantContext } from '@/components/TenantContext'

interface TeamMember {
  id: string
  user_id: string
  role: string
  creado_en: string
  email?: string
}

export default function Equipo() {
  const supabase = createClient()
  const { tenant, loading: tenantLoading } = useTenantContext()

  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tipo: string } | null>(null)
  
  const [modalOpen, setModalOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('staff')

  useEffect(() => {
    if (tenant) {
      loadTeam()
    }
  }, [tenant])

  async function loadTeam() {
    if (!tenant) return
    setLoading(true)
    
    // We can't fetch emails of other users from auth.users via anon key easily, 
    // so we just show the tenant_users records.
    // In a real SaaS, we would use an RPC or edge function to fetch profiles.
    // For now, we display the user_id and role.
    const { data, error } = await supabase
      .from('tenant_users')
      .select('*')
      .eq('tenant_id', tenant.id)

    if (error) {
      msg('Error cargando equipo: ' + error.message, 'error')
    } else {
      setMembers(data || [])
    }
    setLoading(false)
  }

  function msg(m: string, tipo = 'ok') {
    setToast({ msg: m, tipo })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleInvite() {
    if (!inviteEmail) return msg('Ingresá un correo electrónico', 'error')
    setSaving(true)

    try {
      const res = await fetch('/api/equipo/invitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      })
      const result = await res.json()

      if (!res.ok) throw new Error(result.error || 'Error al invitar')
      
      msg('Invitación enviada correctamente ✓')
      setModalOpen(false)
      setInviteEmail('')
      loadTeam()
    } catch (err: any) {
      msg(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(userId: string) {
    if (!confirm('¿Estás seguro de que querés eliminar a este miembro del equipo?')) return
    
    const { error } = await supabase
      .from('tenant_users')
      .delete()
      .eq('tenant_id', tenant!.id)
      .eq('user_id', userId)

    if (error) {
      msg('Error al eliminar: ' + error.message, 'error')
    } else {
      msg('Miembro eliminado')
      loadTeam()
    }
  }

  if (tenantLoading) return <Spinner />

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0 }}>
        <PageHeader 
          title="Gestión de Equipo" 
          sub="Invitá secretarias o colegas a gestionar tu consultorio"
          right={
            <BtnPrimary onClick={() => setModalOpen(true)}>
              + Invitar Miembro
            </BtnPrimary>
          }
        />
        
        <div style={{ padding: '2rem' }}>
          {loading ? <Spinner /> : (
            <DataTable headers={['ID / Usuario', 'Rol', 'Fecha de alta', 'Acciones']} empty={members.length === 0}>
              {members.map(m => (
                <TR key={m.id}>
                  <TD first>
                    <div style={{ fontWeight: 600 }}>Usuario ({m.user_id.substring(0, 8)}...)</div>
                  </TD>
                  <TD>
                    <Badge bg={m.role === 'owner' ? '#e8f0fc' : '#faece7'} color={m.role === 'owner' ? '#185FA5' : '#D85A30'}>
                      {m.role === 'owner' ? 'Propietario' : m.role === 'admin' ? 'Administrador' : 'Staff (Secretaria)'}
                    </Badge>
                  </TD>
                  <TD muted>{new Date(m.creado_en).toLocaleDateString('es-AR')}</TD>
                  <TD>
                    {m.role !== 'owner' && (
                      <BtnSm variant="delete" onClick={() => handleRemove(m.user_id)}>Quitar</BtnSm>
                    )}
                  </TD>
                </TR>
              ))}
            </DataTable>
          )}
        </div>
      </main>

      {modalOpen && (
        <div style={overlayCss()}>
          <div style={modalCss()}>
            <h3 style={modalTitleCss}>Invitar al equipo</h3>
            <div style={groupCss}>
              <label style={labelCss}>Correo Electrónico</label>
              <input 
                type="email"
                style={inputCss} 
                value={inviteEmail} 
                onChange={e => setInviteEmail(e.target.value)} 
                placeholder="secretaria@clinica.com" 
              />
              <p style={{ fontSize: 11, color: '#8fa3bc', marginTop: 4 }}>
                Le enviaremos un correo para que establezca su contraseña. Si ya tiene cuenta, se vinculará automáticamente.
              </p>
            </div>
            <div style={groupCss}>
              <label style={labelCss}>Rol en el consultorio</label>
              <select style={selectCss} value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                <option value="staff">Staff (Secretaria - Gestión de turnos)</option>
                <option value="admin">Administrador (Puede invitar a otros y ver finanzas)</option>
              </select>
            </div>
            <div style={footerCss}>
              <button style={btnLightCss} onClick={() => setModalOpen(false)}>Cancelar</button>
              <BtnPrimary onClick={handleInvite} disabled={saving}>
                {saving ? 'Enviando...' : 'Enviar Invitación'}
              </BtnPrimary>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}
    </div>
  )
}
