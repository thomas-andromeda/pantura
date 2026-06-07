'use client'

import { useState, useEffect } from 'react'
import { useDevice } from '@/contexts/DeviceContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/libs/supabaseClient'
import { useTheme } from '@mui/material/styles'

// MUI Imports
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Tooltip from '@mui/material/Tooltip'

// We need Mui ToggleButton as well
import MuiToggleButton from '@mui/material/ToggleButton'

const categoryOptions = [
  { id: 1, label: 'PC & AC Mati', color: 'secondary.main', bgColor: 'rgba(138, 141, 147, 0.08)' },
  { id: 2, label: 'PC Nyala', color: 'warning.main', bgColor: 'rgba(255, 180, 0, 0.08)' },
  { id: 3, label: 'PC & AC Nyala', color: 'success.main', bgColor: 'rgba(86, 202, 0, 0.08)' },
  { id: 4, label: 'AC Nyala', color: 'info.main', bgColor: 'rgba(3, 195, 236, 0.08)' }
]
const BATAS_SUHU_MIN   = 25.0
const BATAS_SUHU_MAX   = 30.0
const BATAS_LEMBAB_MIN = 50.0
const BATAS_LEMBAB_MAX = 70.0

const klasifikasiKondisi = (suhu, lembab) => {
  if (suhu == null || lembab == null) return { label: '—', color: 'default' }
  const suhuOk   = suhu   >= BATAS_SUHU_MIN && suhu   <= BATAS_SUHU_MAX
  const lembabOk = lembab >= BATAS_LEMBAB_MIN && lembab <= BATAS_LEMBAB_MAX
  if (suhuOk && lembabOk)                                  return { label: 'Nyaman',        color: 'success'   }
  if (suhu > BATAS_SUHU_MAX && lembab > BATAS_LEMBAB_MAX) return { label: 'Panas & Lembap', color: 'error'     }
  if (suhu > BATAS_SUHU_MAX)                               return { label: 'Terlalu Panas',  color: 'warning'   }
  if (suhu < BATAS_SUHU_MIN)                               return { label: 'Terlalu Dingin', color: 'info'      }
  if (lembab > BATAS_LEMBAB_MAX)                           return { label: 'Terlalu Lembap', color: 'secondary' }
  if (lembab < BATAS_LEMBAB_MIN)                           return { label: 'Terlalu Kering', color: 'warning'   }
  return                                                           { label: 'Tidak Normal',  color: 'default'   }
}

// ─── StatusBadge: animated pulse dot + label ─────────────────────────────────
const StatusBadge = ({ isOnline, bgSecondary, textSecondary }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    <Box sx={{ position: 'relative', width: 8, height: 8 }}>
      {/* Solid dot */}
      <Box sx={{
        width: 8, height: 8, borderRadius: '50%',
        bgcolor: isOnline ? '#16A34A' : '#6B6A85',
        position: 'absolute'
      }} />
      {/* Pulse ring — only when online */}
      {isOnline && (
        <Box sx={{
          width: 8, height: 8, borderRadius: '50%',
          bgcolor: '#16A34A',
          position: 'absolute',
          opacity: 0.4,
          animation: 'pulse 2s infinite',
          '@keyframes pulse': {
            '0%':   { transform: 'scale(1)',   opacity: 0.4 },
            '70%':  { transform: 'scale(2.2)', opacity: 0 },
            '100%': { transform: 'scale(1)',   opacity: 0 }
          }
        }} />
      )}
    </Box>
    <Box sx={{
      bgcolor: isOnline ? '#DCFCE7' : bgSecondary,
      color: isOnline ? '#16A34A' : textSecondary,
      borderRadius: '20px', px: 1.5, py: 0.3,
      fontSize: '12px', fontWeight: 500
    }}>
      {isOnline ? 'Online' : 'Offline'}
    </Box>
  </Box>
)

// ─── Main Page Component ──────────────────────────────────────────────────────
const DevicesPage = () => {
  const {
    devices,
    loading: contextLoading,
    addDevice,
    updateDevice,
    deleteDevice,
    updateCategoryMode
  } = useDevice()

  // Design system tokens
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const accent = isDark ? '#A78BFA' : '#7C3AED'
  const accentLight = isDark ? '#2D2650' : '#EDE9FF'
  const bgSecondary = isDark ? '#1A1830' : '#F5F4FE'
  const borderColor = isDark ? 'rgba(167,139,250,0.15)' : 'rgba(124,58,237,0.12)'
  const textSecondary = isDark ? '#9390B0' : '#6B6A85'

  const [deviceStats, setDeviceStats] = useState({})
  const [deviceStatuses, setDeviceStatuses] = useState({})
  const [deviceReadings, setDeviceReadings] = useState({})
  const [loadingStats, setLoadingStats] = useState(false)

  // Dialog states
  const [openAddDialog, setOpenAddDialog] = useState(false)
  const [openEditDialog, setOpenEditDialog] = useState(false)
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false)

  // Form states
  const [newToken, setNewToken] = useState('')
  const [newName, setNewName] = useState('')
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [editName, setEditName] = useState('')

  // Status/Error states
  const [errorMsg, setErrorMsg] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Load stats and statuses
  const fetchStatsAndStatuses = async () => {
    if (devices.length === 0) return
    setLoadingStats(true)

    const stats = {}
    const statuses = {}
    const readings = {}

    for (const d of devices) {
      try {
        // Get count
        const { count, error: countErr } = await supabase
          .from('sensor_data')
          .select('*', { count: 'exact', head: true })
          .eq('device_token', d.device_token)

        stats[d.device_token] = countErr ? 0 : count || 0

        // Get latest reading
        const { data: latest, error: latErr } = await supabase
          .from('sensor_data')
          .select('suhu, kelembapan, created_at')
          .eq('device_token', d.device_token)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!latErr && latest?.created_at) {
          const diff = (new Date() - new Date(latest.created_at)) / 1000
          statuses[d.device_token] = diff < 45

          // Get today's last 50 logs
          const todayStart = new Date()
          todayStart.setHours(0, 0, 0, 0)

          const { data: todayLogs, error: avgErr } = await supabase
            .from('sensor_data')
            .select('suhu, kelembapan')
            .eq('device_token', d.device_token)
            .gte('created_at', todayStart.toISOString())
            .order('created_at', { ascending: false })
            .limit(50)

          let avgSuhu = null
          let avgLembab = null
          if (!avgErr && todayLogs && todayLogs.length > 0) {
            const sumS = todayLogs.reduce((acc, log) => acc + log.suhu, 0)
            const sumL = todayLogs.reduce((acc, log) => acc + log.kelembapan, 0)
            avgSuhu = (sumS / todayLogs.length).toFixed(1)
            avgLembab = (sumL / todayLogs.length).toFixed(1)
          }

          const comfort = klasifikasiKondisi(latest.suhu, latest.kelembapan)

          readings[d.device_token] = {
            suhu: latest.suhu.toFixed(1),
            kelembapan: latest.kelembapan.toFixed(1),
            avgSuhu,
            avgLembab,
            comfortLabel: comfort.label,
            comfortColor: comfort.color
          }
        } else {
          statuses[d.device_token] = false
          readings[d.device_token] = null
        }
      } catch (err) {
        console.error('Error fetching device extra info:', err)
        stats[d.device_token] = 0
        statuses[d.device_token] = false
        readings[d.device_token] = null
      }
    }

    setDeviceStats(stats)
    setDeviceStatuses(statuses)
    setDeviceReadings(readings)
    setLoadingStats(false)
  }

  useEffect(() => {
    fetchStatsAndStatuses()
    const interval = setInterval(fetchStatsAndStatuses, 30000)
    return () => clearInterval(interval)
  }, [devices])

  const handleOpenAdd = () => {
    setNewToken('')
    setNewName('')
    setErrorMsg('')
    setOpenAddDialog(true)
  }

  const handleAddSubmit = async (e) => {
    e.preventDefault()
    if (!newToken.trim() || !newName.trim()) {
      setErrorMsg('Token dan Nama Perangkat harus diisi.')
      return
    }
    setErrorMsg('')
    setActionLoading(true)
    try {
      await addDevice(newToken.trim(), newName.trim())
      setOpenAddDialog(false)
    } catch (err) {
      setErrorMsg(err.message || 'Gagal menambahkan perangkat. Pastikan Token unik.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleOpenEdit = (device) => {
    setSelectedDevice(device)
    setEditName(device.device_name)
    setErrorMsg('')
    setOpenEditDialog(true)
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!editName.trim()) {
      setErrorMsg('Nama Perangkat tidak boleh kosong.')
      return
    }
    setErrorMsg('')
    setActionLoading(true)
    try {
      await updateDevice(selectedDevice.id, { device_name: editName.trim() })
      setOpenEditDialog(false)
    } catch (err) {
      setErrorMsg(err.message || 'Gagal memperbarui perangkat.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleOpenDelete = (device) => {
    setSelectedDevice(device)
    setErrorMsg('')
    setOpenDeleteDialog(true)
  }

  const handleDeleteSubmit = async () => {
    setErrorMsg('')
    setActionLoading(true)
    try {
      await deleteDevice(selectedDevice.id)
      setOpenDeleteDialog(false)
    } catch (err) {
      setErrorMsg(err.message || 'Gagal menghapus perangkat.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleModeChange = async (device, newMode) => {
    if (!newMode) return // Prevent deselecting
    try {
      await updateCategoryMode(device.id, newMode)
    } catch (err) {
      console.error('Failed to change device mode:', err)
    }
  }

  const handleCopyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
  }

  if (contextLoading) {
    return (
      <Box className='flex justify-center items-center min-bs-[300px]'>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box className='p-6'>
      {/* ─── Header ─────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 4 }}>
        <Box>
          <Typography variant='h4' sx={{ fontWeight: 600, fontSize: '22px' }}>Perangkat Saya</Typography>
          <Typography variant='body2' sx={{ color: textSecondary, mt: 0.5 }}>
            Kelola perangkat IoT ESP32 Anda ({devices.length} terdaftar)
          </Typography>
        </Box>
        {/* ─── Tombol Tambah Perangkat ─── */}
        <Button
          variant='contained'
          startIcon={<i className='ri-add-line' />}
          onClick={handleOpenAdd}
          sx={{
            bgcolor: accent,
            color: '#fff',
            borderRadius: '10px',
            textTransform: 'none',
            fontSize: '14px',
            px: 3, py: 1.2,
            boxShadow: `0 4px 12px ${accent}40`,
            '&:hover': { bgcolor: accent, filter: 'brightness(0.9)', boxShadow: `0 6px 16px ${accent}50` },
            '&:active': { transform: 'scale(0.98)' }
          }}
        >
          Tambah Perangkat
        </Button>
      </Box>

      {/* ─── Empty State ─────────────────────────────────────── */}
      {devices.length === 0 ? (
        <Card sx={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          p: 8, textAlign: 'center',
          borderRadius: '16px', border: `0.5px solid ${borderColor}`, boxShadow: 'none'
        }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: accentLight, borderRadius: '50%', width: 72, height: 72, mb: 3
          }}>
            <i className='ri-router-line' style={{ fontSize: '2rem', color: accent }} />
          </Box>
          <Typography variant='h6' sx={{ mb: 1, fontWeight: 500 }}>Belum ada perangkat terdaftar</Typography>
          <Typography variant='body2' sx={{ color: textSecondary, mb: 4, maxWidth: 400 }}>
            Hubungkan perangkat ESP32 Anda ke sistem dengan memasukkan Token Perangkat yang sesuai di dashboard ini.
          </Typography>
          <Button
            variant='contained'
            onClick={handleOpenAdd}
            sx={{
              bgcolor: accent, color: '#fff', borderRadius: '10px',
              textTransform: 'none', px: 3, py: 1.2,
              boxShadow: `0 4px 12px ${accent}40`,
              '&:hover': { bgcolor: accent, filter: 'brightness(0.9)' }
            }}
          >
            Tambah Perangkat Pertama
          </Button>
        </Card>
      ) : (
        /* ─── Device Grid ─────────────────────────────────────── */
        <Grid container spacing={3}>
          {devices.map((device) => {
            const count = deviceStats[device.device_token] ?? 0
            const isOnline = deviceStatuses[device.device_token] ?? false
            const reading = deviceReadings[device.device_token]

            return (
              <Grid item xs={12} md={6} lg={4} key={device.id}>
                {/* ─── Device Card ─────────────────────────────── */}
                <Card sx={{
                  borderRadius: '16px',
                  border: `0.5px solid ${borderColor}`,
                  boxShadow: 'none',
                  position: 'relative',
                  overflow: 'hidden',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'box-shadow 150ms ease',
                  '&:hover': {
                    boxShadow: `0 4px 20px rgba(124, 58, 237, 0.08)`,
                    '& .device-actions': { opacity: 1 }
                  }
                }}>
                  {/* ─── Floating Edit & Delete icons (appear on hover) ── */}
                  <Box className='device-actions' sx={{
                    position: 'absolute', top: 12, right: 12,
                    display: 'flex', gap: 0.5,
                    opacity: 0,
                    transition: 'opacity 150ms ease',
                    zIndex: 1
                  }}>
                    <IconButton size='small' onClick={() => handleOpenEdit(device)} sx={{ color: textSecondary, '&:hover': { color: accent, bgcolor: accentLight } }}>
                      <i className='ri-edit-line' style={{ fontSize: '1rem' }} />
                    </IconButton>
                    <IconButton size='small' onClick={() => handleOpenDelete(device)} sx={{ color: textSecondary, '&:hover': { color: '#DC2626', bgcolor: '#FEE2E2' } }}>
                      <i className='ri-delete-bin-line' style={{ fontSize: '1rem' }} />
                    </IconButton>
                  </Box>

                  {/* ─── Card Content ──────────────────────────────── */}
                  <CardContent sx={{ pb: 0, flexGrow: 1 }}>
                    {/* Device name */}
                    <Typography sx={{ fontSize: '16px', fontWeight: 600, color: 'text.primary', mb: 0.5, pr: 7 }}>
                      {device.device_name}
                    </Typography>

                    {/* Token + copy button */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
                      <Typography sx={{ fontSize: '12px', color: textSecondary, fontFamily: 'monospace' }}>
                        {device.device_token}
                      </Typography>
                      <IconButton size='small' onClick={() => handleCopyToClipboard(device.device_token)} sx={{ color: textSecondary, p: 0.3, '&:hover': { color: accent } }}>
                        <i className='ri-file-copy-line' style={{ fontSize: '0.8rem' }} />
                      </IconButton>
                    </Box>

                    {/* Status badge + Created date */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                      <StatusBadge isOnline={isOnline} bgSecondary={bgSecondary} textSecondary={textSecondary} />
                      <Typography sx={{ fontSize: '12px', color: textSecondary }}>
                        {device.created_at ? new Date(device.created_at).toLocaleDateString('id-ID') : '-'}
                      </Typography>
                    </Box>

                    {/* Data count row */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, p: 1.5, bgcolor: bgSecondary, borderRadius: '8px', border: `0.5px solid ${borderColor}` }}>
                      <i className='ri-database-2-line' style={{ fontSize: '1rem', color: accent }} />
                      <Typography sx={{ fontSize: '13px', color: 'text.primary' }}>
                        <strong>{count.toLocaleString()}</strong>
                        <span style={{ color: textSecondary }}> total data</span>
                      </Typography>
                      {reading && (
                        <Chip label={reading.comfortLabel} size='small' color={reading.comfortColor} sx={{ ml: 'auto', height: 22, fontSize: '11px' }} />
                      )}
                    </Box>

                    {/* Sensor readings 2-col grid */}
                    {reading && (
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
                        <Box sx={{ p: 1.5, bgcolor: bgSecondary, borderRadius: '8px', border: `0.5px solid ${borderColor}`, textAlign: 'center' }}>
                          <i className='ri-temp-hot-line' style={{ color: accent, fontSize: '1rem' }} />
                          <Typography sx={{ fontSize: '18px', fontWeight: 600, fontFamily: 'monospace', color: accent }}>{reading.suhu}°C</Typography>
                          <Typography sx={{ fontSize: '11px', color: textSecondary }}>Suhu Saat Ini</Typography>
                        </Box>
                        <Box sx={{ p: 1.5, bgcolor: bgSecondary, borderRadius: '8px', border: `0.5px solid ${borderColor}`, textAlign: 'center' }}>
                          <i className='ri-drop-line' style={{ color: theme.palette.info.main, fontSize: '1rem' }} />
                          <Typography sx={{ fontSize: '18px', fontWeight: 600, fontFamily: 'monospace', color: theme.palette.info.main }}>{reading.kelembapan}%</Typography>
                          <Typography sx={{ fontSize: '11px', color: textSecondary }}>Kelembapan</Typography>
                        </Box>
                      </Box>
                    )}

                    {/* ─── Mode Aktif 2x2 grid ──────────────────────── */}
                    <Box sx={{ mt: reading ? 0.5 : 2.5 }}>
                      <Typography sx={{ fontSize: '12px', color: textSecondary, fontWeight: 500, mb: 1.5 }}>Mode Aktif</Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                        {categoryOptions.map((opt) => {
                          const isSelected = device.active_category_id === opt.id
                          const modeIcon =
                            opt.id === 1 ? 'ri-power-off-line' :
                            opt.id === 2 ? 'ri-computer-line' :
                            opt.id === 3 ? 'ri-cpu-line' :
                                           'ri-temp-cold-line'
                          return (
                            <MuiToggleButton
                              key={opt.id}
                              value={opt.id}
                              selected={isSelected}
                              onChange={() => handleModeChange(device, opt.id)}
                              sx={{
                                borderRadius: '10px !important',
                                border: `1px solid ${borderColor} !important`,
                                fontSize: '12px',
                                textTransform: 'none',
                                py: 0.8, px: 1.5,
                                justifyContent: 'flex-start',
                                gap: 0.8,
                                transition: 'all 150ms ease',
                                color: `${textSecondary} !important`,
                                bgcolor: 'transparent !important',
                                '&.Mui-selected': {
                                  bgcolor: `${accentLight} !important`,
                                  color: `${accent} !important`,
                                  border: `1px solid ${accent} !important`,
                                  boxShadow: `0 0 8px ${accent}25`,
                                  fontWeight: 600,
                                  '&:hover': {
                                    bgcolor: `${accentLight} !important`,
                                    filter: 'brightness(0.95)'
                                  }
                                },
                                '&:hover': {
                                  bgcolor: `${accentLight}20 !important`,
                                  color: `${accent} !important`,
                                  borderColor: `${accent}40 !important`
                                },
                                '&:active': { transform: 'scale(0.98)' }
                              }}
                            >
                              <i className={modeIcon} style={{ fontSize: '0.85rem' }} />
                              <span style={{ fontSize: '12px' }}>{opt.label}</span>
                            </MuiToggleButton>
                          )
                        })}
                      </Box>
                    </Box>
                  </CardContent>

                  {/* Bottom spacer */}
                  <Box sx={{ pb: 2 }} />
                </Card>
              </Grid>
            )
          })}
        </Grid>
      )}

      {/* ─── Add Device Dialog ────────────────────────────────── */}
      <Dialog open={openAddDialog} onClose={() => !actionLoading && setOpenAddDialog(false)} fullWidth maxWidth='xs'>
        <form onSubmit={handleAddSubmit}>
          <DialogTitle>Tambah Perangkat Baru</DialogTitle>
          <DialogContent className='flex flex-col gap-4 pt-2'>
            {errorMsg && <Alert severity='error'>{errorMsg}</Alert>}
            <TextField
              label='Token Perangkat'
              variant='outlined'
              fullWidth
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              helperText='Token unik untuk dimasukkan di kode ESP32 Anda (misal: esp_kamar_1)'
              required
              disabled={actionLoading}
            />
            <TextField
              label='Nama Perangkat'
              variant='outlined'
              fullWidth
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              helperText='Nama tampilan perangkat (misal: Kamar Utama)'
              required
              disabled={actionLoading}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenAddDialog(false)} disabled={actionLoading}>Batal</Button>
            <Button type='submit' variant='contained' disabled={actionLoading}>
              {actionLoading ? 'Menyimpan...' : 'Tambah'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ─── Edit Device Dialog ───────────────────────────────── */}
      <Dialog open={openEditDialog} onClose={() => !actionLoading && setOpenEditDialog(false)} fullWidth maxWidth='xs'>
        <form onSubmit={handleEditSubmit}>
          <DialogTitle>Edit Nama Perangkat</DialogTitle>
          <DialogContent className='flex flex-col gap-4 pt-2'>
            {errorMsg && <Alert severity='error'>{errorMsg}</Alert>}
            <TextField
              label='Nama Perangkat'
              variant='outlined'
              fullWidth
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
              disabled={actionLoading}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenEditDialog(false)} disabled={actionLoading}>Batal</Button>
            <Button type='submit' variant='contained' disabled={actionLoading}>
              {actionLoading ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ───────────────────────── */}
      <Dialog open={openDeleteDialog} onClose={() => !actionLoading && setOpenDeleteDialog(false)}>
        <DialogTitle>Hapus Perangkat?</DialogTitle>
        <DialogContent>
          {errorMsg && <Alert severity='error' className='mbe-2'>{errorMsg}</Alert>}
          <Typography variant='body1'>
            Apakah kamu yakin ingin menghapus perangkat <strong>{selectedDevice?.device_name}</strong> ({selectedDevice?.device_token})?
          </Typography>
          <Typography variant='body2' color='error' className='mts-2'>
            Tindakan ini tidak bisa dibatalkan. Data sensor historis tidak akan terhapus, tetapi perangkat ini tidak akan lagi muncul di dashboard Anda.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDeleteDialog(false)} disabled={actionLoading}>Batal</Button>
          <Button onClick={handleDeleteSubmit} color='error' variant='contained' disabled={actionLoading}>
            {actionLoading ? 'Menghapus...' : 'Hapus'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default DevicesPage
