'use client'

// React Imports
import { useState, useEffect } from 'react'

// MUI Imports
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'

// Context & Libs
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/libs/supabaseClient'

const AccountDetails = () => {
  // Auth Context
  const { user, profile, fetchProfile } = useAuth()

  // States
  const [namaLengkap, setNamaLengkap] = useState('')
  const [email, setEmail] = useState('')
  const [imgSrc, setImgSrc] = useState('/images/avatars/1.png')
  const [fileInput, setFileInput] = useState('')
  const [base64Img, setBase64Img] = useState('')
  const [saving, setSaving] = useState(false)
  const [alertMsg, setAlertMsg] = useState(null)
  const [alertSeverity, setAlertSeverity] = useState('success')

  // Populate form with real user data on load
  useEffect(() => {
    if (user) {
      setEmail(profile?.email || user?.email || '')
      setNamaLengkap(
        profile?.nama_lengkap ||
        user?.user_metadata?.nama_lengkap ||
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        ''
      )
      setImgSrc(profile?.foto_avatar || user?.user_metadata?.avatar_url || '/images/avatars/1.png')
      setBase64Img(profile?.foto_avatar || '')
    }
  }, [user, profile])

  const handleFileInputChange = (file) => {
    const reader = new FileReader()
    const { files } = file.target

    if (files && files.length !== 0) {
      reader.onload = () => {
        setImgSrc(reader.result)
        setBase64Img(reader.result)
      }
      reader.readAsDataURL(files[0])
    }
  }

  const handleFileInputReset = () => {
    setFileInput('')
    // Revert to database profile pic or default
    setImgSrc(profile?.foto_avatar || user?.user_metadata?.avatar_url || '/images/avatars/1.png')
    setBase64Img(profile?.foto_avatar || '')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setAlertMsg(null)

    try {
      const { error } = await supabase
        .from('user')
        .update({
          nama_lengkap: namaLengkap,
          foto_avatar: base64Img || null
        })
        .eq('id', user.id)

      if (error) throw error

      await fetchProfile(user.id)
      setAlertSeverity('success')
      setAlertMsg('Profil berhasil diperbarui!')
    } catch (err) {
      console.error('Update profile error:', err.message)
      setAlertSeverity('error')
      setAlertMsg(err.message || 'Gagal memperbarui profil.')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setAlertMsg(null)
    setNamaLengkap(profile?.nama_lengkap || '')
    setImgSrc(profile?.foto_avatar || user?.user_metadata?.avatar_url || '/images/avatars/1.png')
    setBase64Img(profile?.foto_avatar || '')
    setFileInput('')
  }

  return (
    <Card>
      <CardContent className='mbe-5'>
        <div className='flex max-sm:flex-col items-center gap-6'>
          <img
            height={100}
            width={100}
            className='rounded object-cover'
            src={imgSrc}
            alt='Profile'
            style={{ width: 100, height: 100 }}
          />
          <div className='flex flex-grow flex-col gap-4'>
            <div className='flex flex-col sm:flex-row gap-4'>
              <Button component='label' size='small' variant='contained' htmlFor='account-settings-upload-image'>
                Upload New Photo
                <input
                  hidden
                  type='file'
                  value={fileInput}
                  accept='image/png, image/jpeg'
                  onChange={handleFileInputChange}
                  id='account-settings-upload-image'
                />
              </Button>
              <Button size='small' variant='outlined' color='error' onClick={handleFileInputReset}>
                Reset
              </Button>
            </div>
            <Typography>Allowed JPG or PNG. Max size of 800K</Typography>
          </div>
        </div>
      </CardContent>
      <CardContent>
        {alertMsg && (
          <Alert severity={alertSeverity} sx={{ mb: 5 }}>
            {alertMsg}
          </Alert>
        )}
        <form onSubmit={handleSubmit}>
          <Grid container spacing={5}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label='Nama Lengkap'
                value={namaLengkap}
                placeholder='Masukkan nama lengkap Anda'
                onChange={(e) => setNamaLengkap(e.target.value)}
                required
                disabled={saving}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label='Email'
                value={email}
                placeholder='john.doe@gmail.com'
                disabled
              />
            </Grid>
            <Grid item xs={12} className='flex gap-4 flex-wrap'>
              <Button variant='contained' type='submit' disabled={saving}>
                {saving ? <CircularProgress size={20} color='inherit' sx={{ mr: 2 }} /> : null}
                Save Changes
              </Button>
              <Button variant='outlined' type='reset' color='secondary' onClick={handleReset} disabled={saving}>
                Reset
              </Button>
            </Grid>
          </Grid>
        </form>
      </CardContent>
    </Card>
  )
}

export default AccountDetails
