function openOptions() {
  if (window.chrome) {
    chrome.runtime.openOptionsPage(err => {
      console.log(`Error: ${error}`);
    });
  } else if (window.browser) {
    window.browser.runtime.openOptionsPage().catch(err => {
      console.log(`Error: ${error}`);
    });
  }
}

function getCurrentTab() {
  if (window.chrome) {
    return new Promise((resolve) => {
      chrome.tabs.query({ currentWindow:true, active:true }, tabs => {
        resolve(tabs[0])
      })
    })
  } else if (window.browser) {
    return browser.tabs.query({ currentWindow:true, active:true }).then(tabs => tabs[0])
  }
}

function executeScript(code) {
  if (window.chrome) {
    return new Promise((resolve) => {
      chrome.tabs.executeScript({ code }, (result) => {
        resolve(result[0])
      })
    })
  } else if (window.browser) {
    return browser.tabs.executeScript({ code })
  }
}

function valueFromMenuItem(liTxt) {
  try {
    const r = liTxt.match(/(\d{4})\-(\d{4})\-(\d{4})/);
    if (r) {
      return r[1] + r[2] + r[3];
    } else {
      return liTxt.split(/\s+/).pop()
    }
  } catch (err) {
    return null
  }
}

window.onload = function() {
  document.getElementById('openOptionsLink').onclick = function(e) {
    openOptions();
    return false;
  }

  document.getElementById('openUpdateNoticeLink').onclick = function(e) {
    chrome.tabs.create({ url: chrome.extension.getURL('updated.html')}, function(tab){});
    return false;
  }

  document.getElementById('openCreditsLink').onclick = function(e) {
    chrome.tabs.create({ url: chrome.extension.getURL('credits.html')}, function(tab){});
    return false;
  }

  getCurrentTab()
    .then(tab => {
      const url = new URL(tab.url)
      if (url.host.endsWith('aws.amazon.com')
       || url.host.endsWith('amazonaws-us-gov.com')
       || url.host.endsWith('console.amazonaws.cn')) {
        loadFormList(url);
        document.querySelector('main').style.display = 'block';
      }
    })
}

function loadFormList(currentUrl) {
  chrome.storage.sync.get([
    'profiles', 'profiles_1', 'profiles_2', 'profiles_3', 'profiles_4',
    'hidesAccountId', 'showOnlyMatchingRoles',
  ], function(data) {
    const hidesAccountId = data.hidesAccountId || false;
    const showOnlyMatchingRoles = /*data.showOnlyMatchingRoles ||*/ false;

    if (data.profiles) {
      const dps = new DataProfilesSplitter();
      const profiles = dps.profilesFromDataSet(data);

      executeScript("document.getElementById('AESR_info').textContent")
        .then(infoJson => {
          const { menuItems } = JSON.parse(infoJson);
          const menuItemValues = menuItems.map(it => valueFromMenuItem(it));
          const [loggedIn, baseAccount, targetRole, targetAccount] = menuItemValues;
          const opts = {
            list: document.getElementById('roleList'),
            loggedIn,
            baseAccount,
            targetRole,
            targetAccount,
            currentUrl,
          }
          loadProfiles(new ProfileSet(profiles, showOnlyMatchingRoles, baseAccount), opts, hidesAccountId);
        })
    }
  });
}

function loadProfiles(profileSet, { list, currentUrl }, hidesAccountId) {
  profileSet.destProfiles.forEach(item => {
    const color = item.color || 'aaaaaa';
    const li = document.createElement('li');
    const headSquare = document.createElement('span');
    headSquare.textContent = ' ';
    headSquare.className = 'headSquare';
    headSquare.style = `background-color: #${color}`
    if (item.image) {
      headSquare.style += `; background-image: url('${item.image.replace(/"/g, '')}');`
    }

    const anchor = document.createElement('a');
    anchor.href = "#";
    anchor.title = item.role_name + '@' + item.aws_account_id;
    anchor.dataset.profile = item.profile;
    anchor.dataset.rolename = item.role_name;
    anchor.dataset.account = item.aws_account_id;
    anchor.dataset.color = color;
    anchor.dataset.redirecturi = replaceRedirectURI(currentUrl, item.region);
    anchor.dataset.search = item.profile + ' ' + item.aws_account_id;

    anchor.appendChild(headSquare);
    anchor.appendChild(document.createTextNode(item.profile));

    if (hidesAccountId) {
      anchor.dataset.displayname = item.profile;
    } else {
      anchor.dataset.displayname = item.profile.toLowerCase() + '  |  ' + item.aws_account_id;

      const accountIdSpan = document.createElement('span');
      accountIdSpan.className = 'suffixAccountId';
      accountIdSpan.textContent = item.aws_account_id;
      anchor.appendChild(accountIdSpan);
    }

    li.appendChild(anchor);
    list.appendChild(li);
  });

  Array.from(list.querySelectorAll('li a')).forEach(anchor => {
    anchor.onclick = function(e) {
      sendSwitchRole(this)
      return false
    }
  });

  let AWSR_firstAnchor = null;
  document.getElementById('roleFilter').onkeyup = function(e) {
    const str = this.value;
    if (e.keyCode === 13) {
      if (AWSR_firstAnchor) {
        AWSR_firstAnchor.click()
      }
    } else {
      const lis = Array.from(document.querySelectorAll('#roleList > li'));
      let firstHitLi = null;
      lis.forEach(li => {
        const anchor = li.querySelector('a')
        const profileName = anchor.dataset.search;
        const hit = str ? profileName.indexOf(str) > -1 : false;
        const shown = str ? hit : true;
        li.style.display = shown ? 'block' : 'none';
        li.style.background = null;
        if (hit && firstHitLi === null) firstHitLi = li;
      });

      if (firstHitLi) {
        firstHitLi.style.background = '#f0f9ff';
        AWSR_firstAnchor = firstHitLi.querySelector('a');
      } else {
        AWSR_firstAnchor = null;
      }
    }
  }

  document.getElementById('roleFilter').focus()
}

function replaceRedirectURI(targetUrl, destRegion) {
  if (!destRegion) return targetUrl;

  let redirectUri = decodeURIComponent(targetUrl);
  const md = redirectUri.match(/region=([a-z\-1-9]+)/);
  if (md) {
    const currentRegion = md[1];
    if (currentRegion !== destRegion) {
      redirectUri = redirectUri.replace(new RegExp(currentRegion, 'g'), destRegion);
      if (currentRegion === 'us-east-1') {
        redirectUri = redirectUri.replace('://', `://${destRegion}.`);
      } else if (destRegion === 'us-east-1') {
        redirectUri = redirectUri.replace(/:\/\/[^.]+\./, '://');
      }
    }
    redirectUri = encodeURIComponent(redirectUri);
  }
  return redirectUri;
}

function sendSwitchRole(anchor) {
  const item = anchor.dataset
  executeScript(`(function() {
    const form = document.getElementById('AESR_form');
    form.account.value = "${item.account}";
    form.color.value = "${item.color}";
    form.roleName.value = "${item.rolename}";
    form.displayName.value = "${item.displayname}";
    form.redirect_uri.value = "${item.redirecturi}";
    form.dataset.region = "${item.region}";
    document.body.appendChild(form)
    form.submit()
  })()`)
  .then(() => {
    window.close();
  })
}
