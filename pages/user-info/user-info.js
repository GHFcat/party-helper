const app = getApp()
const api = require('../../utils/api.js')
Page({

  /**
   * 页面的初始数据
   */
  data: {
    userInfo: null,
    avatar:"", //上传服务器返回的头像Url
    saveSuccess: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {

    this.setData({
      userInfo: app.globalData.userInfo
    })
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  },
  /**
   * 选择头像回调
   * 从基础库2.24.4版本起，若用户上传的图片未通过安全监测，不触发此事件[reference:2]
   */
  onChooseAvatar(e) {
    const {avatarUrl} = e.detail // 临时路径[reference:3]
    this.setData({
      'userInfo.avatar':avatarUrl
    })
   
    api.upload(
      '/file/upload', avatarUrl, 'file'
    ).then((res) => {
      if(res.code==0){
        console.log(res.data.filePath)
        this.setData({avatar:res.data.filePath})
      }
      else{
        wx.showToast({ title: data.message || '上传失败', icon: 'none' })
      }
    }).catch(() => {
      wx.showToast({ title: '上传失败', icon: 'none' })
    })

  },

  /**
   * 昵称输入框失去焦点（基础库2.24.4+会异步进行安全检测）[reference:4]
   */
  onNicknameBlur(e) {
    // const nickName = e.detail.value.trim()
    // if (nickName) {
    //   this.setData({
    //     nickName
    //   })
    // }
  },

  /**
   * 表单提交（推荐使用 form 收集用户输入）[reference:5]
   */
  onFormSubmit(e) {
    const nickName = e.detail.value.nickname?.trim() || ''
    if (!nickName) {
      wx.showToast({
        title: '请填写昵称',
        icon: 'none'
      })
      return
    }
    api.patch('/wx/game/updateuser/'+this.data.userInfo.id,{nickName,avatar:this.data.avatar})
    .then(()=>{

    })
  },

})