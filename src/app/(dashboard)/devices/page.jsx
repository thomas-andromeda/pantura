'use client'

import { useState, useEffect } from 'react'
import { useDevice } from '@/contexts/DeviceContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/libs/supabaseClient'

// MUI Imports
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
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
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import ToggleButton from '@mui/material/ToggleButtonGroup' // Wait, Mui ToggleButton needs to be imported separately
import Divider from '@mui/material/Divider'
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

const DevicesPage = () => {
  const {
    devices,
    loading: contextLoading,
    addDevice,
    updateDevice,
    deleteDevice,
    updateCategoryMode
  } = useDevice()

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
      {/* Header */}
      <Box className='flex flex-wrap justify-between items-center gap-4 mbe-6'>
        <Box>
          <Typography variant='h4' className='font-semibold'>Perangkat Saya</Typography>
          <Typography variant='body2' color='textSecondary'>
            Kelola perangkat IoT ESP32 Anda ({devices.length} terdaftar)
          </Typography>
        </Box>
        <Button
          variant='contained'
          color='primary'
          startIcon={<i className='ri-add-line' />}
          onClick={handleOpenAdd}
        >
          Tambah Perangkat
        </Button>
      </Box>

      {devices.length === 0 ? (
        <Card className='flex flex-col items-center justify-center p-12 text-center shadow-md'>
          <Box className='flex items-center justify-center bg-primary-light rounded-full p-4 mbe-4' style={{ backgroundColor: 'rgba(102, 108, 255, 0.08)' }}>
            <i className='ri-router-line text-primary' style={{ fontSize: '3rem' }} />
          </Box>
          <Typography variant='h6' className='mbe-2 font-medium'>Belum ada perangkat terdaftar</Typography>
          <Typography variant='body2' color='textSecondary' className='mbe-6 max-w-sm'>
            Hubungkan perangkat ESP32 Anda ke sistem dengan memasukkan Token Perangkat yang sesuai di dashboard ini.
          </Typography>
          <Button variant='contained' onClick={handleOpenAdd}>
            Tambah Perangkat Pertama
          </Button>
        </Card>
      ) : (
        <Grid container spacing={6}>
          {devices.map((device) => {
            const count = deviceStats[device.device_token] ?? 0
            const isOnline = deviceStatuses[device.device_token] ?? false
            const readings = deviceReadings[device.device_token]
            const formattedDate = new Date(device.created_at).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            })

            return (
              <Grid item xs={12} md={6} lg={4} key={device.id}>
                <Card className='h-full flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow duration-300'>
                  <Box>
                    {/* Card Header custom */}
                    <Box className='flex justify-between items-start p-6 pb-2'>
                      <Box sx={{ overflow: 'hidden', mr: 2 }}>
                        <Typography variant='h6' className='font-medium' noWrap>
                          {device.device_name}
                        </Typography>
                        <Box className='flex items-center gap-1 mt-1'>
                          <Typography variant='caption' className='bg-light rounded px-1.5 py-0.5 border text-secondary font-mono'>
                            {device.device_token}
                          </Typography>
                          <Tooltip title='Salin Token'>
                            <IconButton size='small' onClick={() => handleCopyToClipboard(device.device_token)}>
                              <i className='ri-file-copy-line text-sm' />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                      <Chip
                        label={isOnline ? 'Online' : 'Offline'}
                        color={isOnline ? 'success' : 'default'}
                        size='small'
                        className='font-semibold'
                      />
                    </Box>

                    <CardContent className='pt-2'>
                      {/* Device statistics info */}
                      <Grid container spacing={2} className='mbe-4 bg-light rounded p-2.5 border' style={{ backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
                        <Grid item xs={6}>
                          <Typography variant='caption' color='textSecondary' display='block'>Data Tercatat</Typography>
                          <Typography variant='body2' className='font-semibold'>{count} baris</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant='caption' color='textSecondary' display='block'>Terdaftar Pada</Typography>
                          <Typography variant='body2' className='font-semibold'>{formattedDate}</Typography>
                        </Grid>
                      </Grid>

                      {/* Tampilan Ringkasan Data Sensor */}
                      {readings ? (
                        <Box className='mbe-4 p-3 rounded border' sx={{ borderStyle: 'dashed', borderColor: 'divider', bgcolor: 'action.hover' }}>
                          <Box className='flex justify-between items-center mbe-2'>
                            <Typography variant='caption' fontWeight={600} color='text.primary'>
                              Data Terkini & Rata-rata
                            </Typography>
                            <Chip
                              label={readings.comfortLabel}
                              color={readings.comfortColor}
                              size='small'
                              variant='tonal'
                              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }}
                            />
                          </Box>
                          <Grid container spacing={2}>
                            <Grid item xs={6} className='border-r pr-2' sx={{ borderColor: 'divider' }}>
                              <Typography variant='caption' color='textSecondary' display='block' sx={{ fontSize: '0.7rem' }}>
                                Saat Ini
                              </Typography>
                              <Typography variant='body2' className='font-semibold' sx={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 0.8, mt: 0.5 }}>
                                <i className='ri-temp-hot-line' style={{ fontSize: '0.85rem' }} /> {readings.suhu}°C
                                <span className='text-secondary'>|</span>
                                <i className='ri-drop-line' style={{ fontSize: '0.85rem' }} /> {readings.kelembapan}%
                              </Typography>
                            </Grid>
                            <Grid item xs={6} className='pl-2'>
                              <Typography variant='caption' color='textSecondary' display='block' sx={{ fontSize: '0.7rem' }}>
                                Rata-rata Hari Ini (50 Log)
                              </Typography>
                              <Typography variant='body2' className='font-semibold' sx={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 0.8, mt: 0.5 }}>
                                {readings.avgSuhu != null && readings.avgLembab != null ? (
                                  <>
                                    <i className='ri-temp-hot-line' style={{ fontSize: '0.85rem' }} /> {readings.avgSuhu}°C
                                    <span className='text-secondary'>|</span>
                                    <i className='ri-drop-line' style={{ fontSize: '0.85rem' }} /> {readings.avgLembab}%
                                  </>
                                ) : (
                                  <span style={{ fontSize: '0.7rem' }}>Belum ada log hari ini</span>
                                )}
                              </Typography>
                            </Grid>
                          </Grid>
                        </Box>
                      ) : (
                        <Box className='mbe-4 p-3 rounded border text-center' sx={{ borderStyle: 'dashed', borderColor: 'divider', bgcolor: 'action.hover' }}>
                          <Typography variant='caption' color='textSecondary'>
                            Belum ada log sensor yang terekam
                          </Typography>
                        </Box>
                      )}

                      <Divider className='mlb-4' />

                      {/* Mode Control */}
                      <Typography variant='subtitle2' className='mbe-2 font-medium' color='textPrimary'>
                        Mode Perangkat Aktif:
                      </Typography>
                      <Grid container spacing={1}>
                        {categoryOptions.map((opt) => {
                          const isSelected = device.active_category_id === opt.id
                          return (
                            <Grid item xs={6} key={opt.id}>
                              <Box
                                onClick={() => handleModeChange(device, opt.id)}
                                className='flex items-center gap-2 p-2.5 rounded border cursor-pointer select-none transition-all'
                                sx={{
                                  borderColor: isSelected ? opt.color : 'divider',
                                  backgroundColor: isSelected ? opt.bgColor : 'background.paper',
                                  '&:hover': {
                                    backgroundColor: isSelected ? opt.bgColor : 'action.hover'
                                  }
                                }}
                              >
                                <Box className='overflow-hidden' sx={{ w: '100%' }}>
                                  <Typography variant='caption' className='font-semibold text-textPrimary' display='block' noWrap>
                                    {opt.label}
                                  </Typography>
                                  {isSelected && (
                                    <Typography variant='caption' sx={{ color: opt.color, fontWeight: 700 }}>
                                      Aktif
                                    </Typography>
                                  )}
                                </Box>
                              </Box>
                            </Grid>
                          )
                        })}
                      </Grid>
                    </CardContent>
                  </Box>

                  {/* Actions */}
                  <Box className='flex justify-between items-center p-6 pt-2 border-t mt-4'>
                    <IconButton color='primary' onClick={() => handleOpenEdit(device)}>
                      <i className='ri-pencil-line' />
                    </IconButton>
                    <IconButton color='error' onClick={() => handleOpenDelete(device)}>
                      <i className='ri-delete-bin-line' />
                    </IconButton>
                  </Box>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      )}

      {/* Add Device Dialog */}
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

      {/* Edit Device Dialog */}
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

      {/* Delete Confirmation Dialog */}
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
